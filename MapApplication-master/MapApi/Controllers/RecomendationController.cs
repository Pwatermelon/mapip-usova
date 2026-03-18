using AngleSharp.Io;
using MapApi.Context;
using MapApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Newtonsoft.Json;
using Npgsql;
using System;
using System.Data;
using System.Web;
using VDS.RDF;
using VDS.RDF.Parsing;
using VDS.RDF.Query;
using Microsoft.Extensions.Logging;

namespace MapApi.Controllers
{
    [Route("api/recommendation")]
    [ApiController]
    public class RecommendationController : ControllerBase
    {
        private readonly ApplicationContext _context;
        private readonly string _connectionString;
        private readonly HttpClient _httpClient;

        public RecommendationController(ApplicationContext context, HttpClient httpClient, IConfiguration configuration)
        {
            _context = context;
            _httpClient = httpClient;
            _connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? "Host=localhost;Port=5432;Username=postgres;Password=12345;Database=map";
        }

        // Метод для получения параметров для генерации рекомендаций
        private async Task<(int rnValue, List<string> categoriesToExclude)> ReadParametersAsync()
        {
            using (var connection = new NpgsqlConnection(_connectionString))
            {
                await connection.OpenAsync();

                using (var command = new NpgsqlCommand(@"
                SELECT ""RnValue"", ""ExcludedCategories"" 
                FROM public.""AdminSettings"" 
                LIMIT 1;", connection))
                {
                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        if (await reader.ReadAsync())
                        {
                            int rnValue = reader.GetInt32(reader.GetOrdinal("RnValue"));
                            var excludedCategoriesString = reader.IsDBNull(reader.GetOrdinal("ExcludedCategories"))
                                ? ""
                                : reader.GetString(reader.GetOrdinal("ExcludedCategories"));

                            var categoriesToExclude = excludedCategoriesString
                                .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                                .Select(c => c.Trim())
                                .ToList();
                            //Console.WriteLine("Checking parameter rnValue: " + rnValue);
                            //Console.WriteLine("Checking parameter excludedCategories: " + excludedCategoriesString);
                            return (rnValue, categoriesToExclude);
                        }
                        else
                        {
                            throw new Exception("Settings not found");
                        }
                    }
                }
            }
        }

        // Метод для получения всех рекомендаций коллаборативной фильтрации
        private async Task<Dictionary<int, List<string>>> GetAllRecommendationsCollab()
        {
            var recommendationsResponse = await _httpClient.GetAsync("http://localhost:5001/recommendations/recommend_all");
            if (!recommendationsResponse.IsSuccessStatusCode)
            {
                throw new Exception($"Error fetching recommendations: {await recommendationsResponse.Content.ReadAsStringAsync()}");
            }

            var recommendations = await recommendationsResponse.Content.ReadFromJsonAsync<Dictionary<int, List<int>>>();
            var mapObjects = new Dictionary<int, List<string>>();

            foreach (var userRecommendations in recommendations)
            {
                var userId = userRecommendations.Key;
                var recommendedItemIds = userRecommendations.Value;

                using (var connection = new NpgsqlConnection(_connectionString))
                {
                    await connection.OpenAsync();

                    using (var command = new NpgsqlCommand(@"
            SELECT ""IRI""
            FROM public.""MapObject""
            WHERE ""Id"" = ANY(@ids);", connection))
                    {
                        command.Parameters.AddWithValue("ids", recommendedItemIds.ToArray());

                        using (var reader = await command.ExecuteReaderAsync())
                        {
                            var iriList = new List<string>();
                            while (await reader.ReadAsync())
                            {
                                iriList.Add(reader.GetString(reader.GetOrdinal("IRI")));
                            }
                            mapObjects[userId] = iriList;
                        }
                    }
                }
            }

            return mapObjects;
        }

        // Метод для получения всех контекстных рекомендаций из онтологии 
        private async Task<Dictionary<int, List<string>>> GetOntologyRecommendations(int rnValue, List<string> categoriesToExclude)
        {
            var userRoutes = new List<RecommendationData>();

            using (var connection = new NpgsqlConnection(_connectionString))
            {
                await connection.OpenAsync();

                using (var command = new NpgsqlCommand(@"
        WITH RankedRoutes AS (
            SELECT 
                r.""Id"" AS route_id, 
                r.""UserId"", 
                r.""Date"",
                ROW_NUMBER() OVER (PARTITION BY r.""UserId"" ORDER BY r.""Date"" DESC) AS rn
            FROM public.""Route"" r
            WHERE r.""UserId"" IS NOT NULL
        ),
        LastNRoutes AS (
            SELECT 
                route_id, 
                ""UserId"", 
                ""Date""
            FROM RankedRoutes
            WHERE rn <= @rnValue
        ),
        RouteMapObjects AS (
            SELECT 
                rmo.""ListObjectsId"", 
                rmo.""RouteId""
            FROM public.""RouteMapObject"" rmo
            JOIN LastNRoutes lnr ON rmo.""RouteId"" = lnr.""route_id""
        ),
        MapObjects AS (
            SELECT 
                mo.""Id"", 
                mo.""IRI""
            FROM public.""MapObject"" mo
            JOIN RouteMapObjects rmo ON mo.""Id"" = rmo.""ListObjectsId""
        )
        SELECT 
            u.""Id"" AS user_id, 
            mo.""IRI""
        FROM public.""User"" u
        JOIN LastNRoutes lnr ON u.""Id"" = lnr.""UserId""
        JOIN RouteMapObjects rmo ON lnr.""route_id"" = rmo.""RouteId""
        JOIN MapObjects mo ON rmo.""ListObjectsId"" = mo.""Id"" 
        ORDER BY u.""Id"", lnr.""Date""", connection))
                {
                    command.Parameters.AddWithValue("rnValue", rnValue);

                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            userRoutes.Add(new RecommendationData
                            {
                                UserId = reader.GetInt32(reader.GetOrdinal("user_id")),
                                IRI = reader.GetString(reader.GetOrdinal("IRI"))
                            });
                        }
                    }
                }
            }

            IGraph g = new Graph();
            g.LoadFromFile("Ontology_Social_objects_new.rdf");

            var userBuildings = new Dictionary<int, List<string>>();
            var parser = new SparqlQueryParser();

            foreach (var userRoute in userRoutes)
            {
                string iri = userRoute.IRI;
                int userId = userRoute.UserId;

                var excludeFilter = categoriesToExclude.Any()
                    ? $"FILTER(?категория NOT IN ({string.Join(", ", categoriesToExclude.Select(c => $"<http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#{c.Replace(" ", "_")}>"))}))"
                    : "";

                string queryStr = $@"
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
        PREFIX obj: <http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#>
        SELECT ?объекты
        WHERE {{
            {{
                SELECT ?учреждение ?x
                WHERE {{
                    <{iri}> obj:является ?x .
                    ?x rdf:type ?учреждение.
                    FILTER(?учреждение != owl:NamedIndividual)
                }}
            }}
            ?категория rdf:type ?учреждение.
            ?объекты obj:является ?категория.
            FILTER (?объекты != <{iri}>)
            {excludeFilter}
        }}";
                SparqlQuery query = parser.ParseFromString(queryStr);
                Object results = g.ExecuteQuery(query);
                var buildings = new List<string>();

                if (results is SparqlResultSet rset)
                {
                    //Console.WriteLine(queryStr);
                    foreach (SparqlResult buildingResult in rset)
                    {
                        foreach (var variable in buildingResult.Variables)
                        {
                            string buildingUri = buildingResult[variable].ToString();
                            string decodedString = HttpUtility.UrlDecode(buildingUri);
                            string buildingName = decodedString.Replace("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#", "").Replace("_", " ");
                            buildings.Add(decodedString);
                            //Console.WriteLine($"Object: {buildingName}");
                        }
                    }
                }

                if (!userBuildings.ContainsKey(userId))
                {
                    userBuildings[userId] = new List<string>();
                }

                userBuildings[userId].AddRange(buildings);
            }

            return userBuildings;
        }

        // Метод для генерации рекомендаций в БД
        [HttpPut]
        [Route("/putIntersectedData")]
        public async Task<ActionResult<Dictionary<int, List<string>>>> PutIntersectedData()
        {
            var (rnValue, categoriesToExclude) = await ReadParametersAsync();

            try
            {
                var mapObjects = await GetAllRecommendationsCollab();
                var userBuildings = await GetOntologyRecommendations(rnValue, categoriesToExclude);

                using (var connection = new NpgsqlConnection(_connectionString))
                {
                    await connection.OpenAsync();

                    using (var command = new NpgsqlCommand(@"
                    DELETE FROM public.""Recommendation"";", connection))
                    {
                        await command.ExecuteNonQueryAsync();
                    }
                }

                var intersectedData = new Dictionary<int, List<string>>();

                foreach (var userId in mapObjects.Keys)
                {
                    if (userBuildings.ContainsKey(userId))
                    {
                        var intersection = mapObjects[userId].Intersect(userBuildings[userId]).ToList();
                        if (intersection.Any())
                        {
                            intersectedData[userId] = intersection;

                            foreach (var iri in intersection)
                            {
                                using (var connection = new NpgsqlConnection(_connectionString))
                                {
                                    await connection.OpenAsync();

                                    using (var command = new NpgsqlCommand(@"
                        INSERT INTO public.""Recommendation"" (""UserID"", ""MapObjectID"")
                        VALUES (@userId, (SELECT ""Id"" FROM public.""MapObject"" WHERE ""IRI"" = @iri));", connection))
                                    {
                                        command.Parameters.AddWithValue("userId", userId);
                                        command.Parameters.AddWithValue("iri", iri);

                                        await command.ExecuteNonQueryAsync();
                                    }
                                }
                            }
                        }
                    }
                }

                /*Console.WriteLine("Collaborative recommendations:");
                foreach (var userRecommendations in mapObjects)
                {
                    int userId = userRecommendations.Key;
                    List<string> recommendedIris = userRecommendations.Value;

                    Console.WriteLine($"User: {userId}");
                    int count = 0;

                    foreach (string iri in recommendedIris)
                    {
                        Console.WriteLine($"  - Map object (IRI): {iri}");
                        count++;
                        if (count >= 5) break;
                    }
                }

                Console.WriteLine("Recommendations from ontology:");
                foreach (var userBuilding in userBuildings)
                {
                    int userId = userBuilding.Key;
                    List<string> buildingIris = userBuilding.Value;

                    Console.WriteLine($"User: {userId}");
                    int count = 0;
                    foreach (string iri in buildingIris)
                    {
                        Console.WriteLine($"  - Map object (IRI): {iri}");
                        count++;
                        if (count >= 5) break;
                    }
                }*/


                return Ok(intersectedData);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
                return StatusCode(500, "Internal server error.");
            }

        }


        // Получение рекомендаций по фильтрам
        [HttpPost]
        [Route("GetFilteringIntersectedData")]
        public async Task<ActionResult<List<RecommendationF>>> GetFilteringIntersectedData([FromBody] FilterOptions filterOptions)
        {
            var userId = filterOptions.UserId;
            var selectedCategories = filterOptions.Categories;
            var selectedAccessibility = filterOptions.AccessibilityElements;

            var filteredRecommendations = new List<RecommendationF>();

            using (var connection = new NpgsqlConnection(_connectionString))
            {
                await connection.OpenAsync();

                using (var command = new NpgsqlCommand(@"
            SELECT ""MapObjectID"", ""IRI""
            FROM public.""Recommendation""
            JOIN public.""MapObject"" ON ""MapObjectID"" = ""Id""
            WHERE ""UserID"" = @userId", connection))
                {
                    command.Parameters.AddWithValue("userId", Convert.ToInt32(userId));

                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        var userRoutes = new List<(int MapObjectID, string IRI)>();

                        while (await reader.ReadAsync())
                        {
                            var mapObjectID = reader.GetInt32(0);
                            var iri = reader.GetString(1);
                            userRoutes.Add((mapObjectID, iri));
                        }

                        List<string> iriFilters = new List<string>();
                        foreach (var userRoute in userRoutes)
                        {
                            iriFilters.Add($"?здание = <{userRoute.IRI}>");
                        }

                        string iriFilter = iriFilters.Any() ? $"FILTER({string.Join(" || ", iriFilters)})" : "";
                        string categoryFilter = selectedCategories.Any()
                            ? string.Join(" \n", selectedCategories.Select(c => $"obj:{c} \"true\"^^xsd:boolean ;"))
                            : "";
                        string accessibilityFilter = selectedAccessibility.Any()
                            ? string.Join(" \n", selectedAccessibility.Select(a => $"obj:имеет {a} ;"))
                            : "";

                        string queryStr = $@"
                    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
                    PREFIX owl: <http://www.w3.org/2002/07/owl#>
                    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
                    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
                    PREFIX obj: <http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#>

                    SELECT ?здание WHERE {{ 
                        ?здание 
                        {categoryFilter}
                        {accessibilityFilter}
                        {iriFilter}
                    }}";

                        IGraph g = new Graph();
                        g.LoadFromFile("Ontology_Social_objects_new.rdf");

                        SparqlQueryParser parser = new SparqlQueryParser();
                        SparqlQuery query = parser.ParseFromString(queryStr);
                        Object results = g.ExecuteQuery(query);

                        if (results is SparqlResultSet rset)
                        {
                            foreach (SparqlResult buildingResult in rset)
                            {
                                foreach (var variable in buildingResult.Variables)
                                {
                                    string buildingUri = buildingResult[variable].ToString();

                                    buildingUri = Uri.UnescapeDataString(buildingUri).ToString();

                                    Console.WriteLine(buildingUri);
                                    var mapObject = await GetMapObjectByIri(buildingUri);

                                    if (mapObject != null)
                                    {
                                        var recommendation = new RecommendationF
                                        {
                                            MapObject = mapObject
                                        };
                                        filteredRecommendations.Add(recommendation);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            return Ok(filteredRecommendations);
        }

        // Метод для получения MapObject по IRI
        private async Task<MapObject> GetMapObjectByIri(string iri)
        {
            using (var connection = new NpgsqlConnection(_connectionString))
            {
                await connection.OpenAsync();

                using (var mapObjectCommand = new NpgsqlCommand(@"
            SELECT ""Id"", ""Adress"", ""Display_name"", ""Type"", ""Images"", ""X"", ""Y"", ""Rating""
            FROM public.""MapObject""
            WHERE ""IRI"" = @iri", connection))
                {
                    mapObjectCommand.Parameters.AddWithValue("iri", iri);

                    using (var mapObjectReader = await mapObjectCommand.ExecuteReaderAsync())
                    {
                        if (await mapObjectReader.ReadAsync())
                        {
                            return new MapObject
                            {
                                Id = mapObjectReader.GetInt32(0),
                                Adress = mapObjectReader.GetString(1),
                                Display_name = mapObjectReader.GetString(2),
                                Type = mapObjectReader.GetString(3),
                                Images = mapObjectReader.GetString(4),
                                X = mapObjectReader.GetDouble(5),
                                Y = mapObjectReader.GetDouble(6),
                                Rating = mapObjectReader.GetInt32(7)
                            };
                        }
                    }
                }
            }

            return null;
        }

        [HttpPost]
        [Route("GetFilteringPopularData")]
        public async Task<ActionResult<List<RecommendationF>>> GetFilteringIntersectedData2([FromBody] FilterOptions filterOptions)
        {
            var selectedCategories = filterOptions.Categories;
            var selectedAccessibility = filterOptions.AccessibilityElements;

            var filteredRecommendations = new List<RecommendationF>();

            var popularRecommendationsResult = await GetPopularRecommendations();
            if (popularRecommendationsResult.Result is NotFoundResult)
            {
                return NotFound();
            }
            var popularRecommendations = popularRecommendationsResult.Value;

            var userRoutes = popularRecommendations
                .Select(obj => (MapObjectID: obj.Id, IRI: obj.IRI))
                .ToList();

            List<string> iriFilters = userRoutes.Select(userRoute => $"?здание = <{userRoute.IRI}>").ToList();
            string iriFilter = iriFilters.Any() ? $"FILTER({string.Join(" || ", iriFilters)})" : "";

            string categoryFilter = selectedCategories.Any()
                ? string.Join(" \n", selectedCategories.Select(c => $"obj:{c} \"true\"^^xsd:boolean ;"))
                : "";

            string accessibilityFilter = selectedAccessibility.Any()
                ? string.Join(" \n", selectedAccessibility.Select(a => $"obj:имеет {a} ;"))
                : "";

            string queryStr = $@"
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
                PREFIX owl: <http://www.w3.org/2002/07/owl#>
                PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
                PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
                PREFIX obj: <http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#>

                SELECT ?здание WHERE {{ 
                    ?здание 
                    {categoryFilter}
                    {accessibilityFilter}
                    {iriFilter}
                }}";

            IGraph g = new Graph();
            g.LoadFromFile("Ontology_Social_objects_new.rdf");
            Console.WriteLine(queryStr);
            SparqlQueryParser parser = new SparqlQueryParser();
            SparqlQuery query = parser.ParseFromString(queryStr);
            Object results = g.ExecuteQuery(query);

            if (results is SparqlResultSet rset)
            {
                foreach (SparqlResult buildingResult in rset)
                {
                    foreach (var variable in buildingResult.Variables)
                    {
                        string buildingUri = buildingResult[variable].ToString();

                        buildingUri = Uri.UnescapeDataString(buildingUri).ToString();

                        Console.WriteLine(buildingUri);
                        var mapObject = await GetMapObjectByIri(buildingUri);
                        Console.WriteLine(buildingUri);
                        if (mapObject != null)
                        {
                            var recommendation = new RecommendationF
                            {
                                MapObject = mapObject
                            };
                            filteredRecommendations.Add(recommendation);
                            Console.WriteLine(filteredRecommendations);
                        }
                    }
                }
            }

            return Ok(filteredRecommendations);
        }

        // Получение рекомендаций по ID пользователя
        [HttpGet("GetRecommendationsByUserId/{userId}")]
        public async Task<ActionResult<IEnumerable<MapObject>>> GetRecommendationsByUserId(int userId)
        {
            var mapObjects = await _context.Recommendation
                .Where(r => r.UserID == userId)
                .Select(r => r.MapObject)
                .ToListAsync();

            if (mapObjects == null || !mapObjects.Any())
            {
                return NotFound();
            }
            return Ok(mapObjects);
        }

        // Метод для получения рекомендаций для незарегистрированных пользователей
        [HttpGet("GetPopularRecommendations")]
        public async Task<ActionResult<IEnumerable<MapObject>>> GetPopularRecommendations()
        {
            var popularRecommendations = await _context.MapObject
                .Join(_context.Comment.GroupBy(c => c.MapObjectId)
                    .Select(g => new { MapObjectId = g.Key, Count = g.Count() }),
                    mapObject => mapObject.Id,
                    groupResult => groupResult.MapObjectId,
                    (mapObject, groupResult) => new { MapObject = mapObject, Count = groupResult.Count })
                .Where(result => result.MapObject.Rating >= 4)
                .OrderByDescending(result => result.MapObject.Rating)
                .Select(result => result.MapObject)
                .Take(25)
                .ToListAsync();

            if (!popularRecommendations.Any())
            {
                return NotFound();
            }
            return popularRecommendations;
        }

        // Удаление рекомендации
        [HttpDelete("RemoveRecommendation/{mapObjectId}/{userId}")]
        public async Task<IActionResult> RemoveRecommendation(int mapObjectId, int userId)
        {
            var recommendation = await _context.Recommendation
                .FirstOrDefaultAsync(r => r.MapObjectID == mapObjectId && r.UserID == userId);

            if (recommendation == null)
            {
                return NotFound();
            }

            _context.Recommendation.Remove(recommendation);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // Метод для сортировки рекомендаций
        [HttpPost]
        [Route("SortRecommendations")]
        public async Task<ActionResult<List<RecommendationF>>> SortRecommendations([FromBody] SortRequest request)
        {
            var recommendations = request.Recommendations;
            var userLatitude = request.UserLatitude;
            var userLongitude = request.UserLongitude;

            var sortedRecommendations = new List<RecommendationF>();

            using (var connection = new NpgsqlConnection(_connectionString))
            {
                await connection.OpenAsync();

                foreach (var rec in recommendations)
                {
                    Console.WriteLine(rec);
                    var mapObjectId = rec.MapObject.Id;

                    using (var command = new NpgsqlCommand(@"
                SELECT ""X"", ""Y"" 
                FROM public.""MapObject"" 
                WHERE ""Id"" = @mapObjectId", connection))
                    {
                        command.Parameters.AddWithValue("mapObjectId", mapObjectId);

                        using (var reader = await command.ExecuteReaderAsync())
                        {
                            if (await reader.ReadAsync())
                            {
                                var latitude = reader.GetDouble(0);
                                var longitude = reader.GetDouble(1);

                                double distance = CalculateDistance(userLatitude, userLongitude, latitude, longitude);

                                rec.MapObject.X = latitude;
                                rec.MapObject.Y = longitude;
                                rec.Distance = distance;

                                sortedRecommendations.Add(rec);
                            }
                        }
                    }
                }
            }

            sortedRecommendations = sortedRecommendations.OrderBy(r => r.Distance).ToList();

            return Ok(sortedRecommendations);
        }

        // Метод для расчета расстояния между двумя координатами
        private double CalculateDistance(double userLat, double userLon, double objLat, double objLon)
        {
            var earthRadius = 6371; 

            var dLat = DegreesToRadians(objLat - userLat);
            var dLon = DegreesToRadians(objLon - userLon);

            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                    Math.Cos(DegreesToRadians(userLat)) * Math.Cos(DegreesToRadians(objLat)) *
                    Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));

            return earthRadius * c; 
        }
        
        // Вспомогательный метод для рассчета в радианы
        private double DegreesToRadians(double degrees)
        {
            return degrees * Math.PI / 180;
        }

    }

    public class RecommendationRequest
    {
        public Dictionary<int, List<string>> MapObjects { get; set; }
        public Dictionary<int, List<string>> UserBuildings { get; set; }
    }

    public class SortRequest
    {
        public List<RecommendationF> Recommendations { get; set; }
        public double UserLatitude { get; set; }
        public double UserLongitude { get; set; }
    }
    public class FilterOptions
    {
        public int UserId { get; set; } 
        public List<string> Categories { get; set; }
        public List<string> AccessibilityElements { get; set; }
    }
    public class RecommendationF
    {
        public MapObject MapObject { get; set; }
        public double Distance { get; set; }
    }
   
    public class RecommendationData
    {
        public int UserId { get; set; }
        public string IRI { get; set; }
    }
}
