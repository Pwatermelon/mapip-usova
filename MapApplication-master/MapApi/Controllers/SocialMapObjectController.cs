using MapApi.Context;
using MapApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json.Linq;
using System.Web;
using VDS.RDF;
using VDS.RDF.Parsing;
using VDS.RDF.Query;
using System.Net.Http;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using static Lucene.Net.Analysis.Synonym.SynonymMap;
using VDS.RDF.Ontology;
using System.IO;

namespace MapApi.Controllers
{
    [Route("api/SocialMapObject")]
    [ApiController]
    public class SocialMapObjectController : Controller
    {
        private readonly ApplicationContext _context;

        private readonly HttpClient _httpClient;

        public SocialMapObjectController(ApplicationContext context, HttpClient httpClient)
        {
            _context = context;
            _httpClient = httpClient;
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "C# App");
        }

        // Метод для подгрузки объектов городской среды из онтологии в БД
        [HttpGet]
        [Route("/GetOntologyObjects")]
        public async Task<ActionResult<IEnumerable<MapObject>>> GetOntologyObjects()
        {
            IGraph g = new Graph();
            g.LoadFromFile("Ontology_Social_objects_new.rdf");

            SparqlQueryParser parser = new SparqlQueryParser();
            SparqlQuery q = parser.ParseFromString("PREFIX obj: <http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#>" +
                "SELECT ?object ?x ?y ?type ?description ?workingHours ?images ?rating ?categoryG ?categoryK ?categoryO ?categoryS ?categoryU ?accessibility WHERE { " +
                "?object obj:X ?x . ?object obj:Y ?y . ?object obj:является ?type . " +
                "OPTIONAL { ?object obj:описание ?description . } " +
                "OPTIONAL { ?object obj:график_работы ?workingHours . } " +
                "OPTIONAL { ?object obj:изображения ?images . } " +
                "OPTIONAL { ?object obj:рейтинг ?rating . } " +
                "OPTIONAL { ?object obj:категория_Г ?categoryG . } " +
                "OPTIONAL { ?object obj:категория_К ?categoryK . } " +
                "OPTIONAL { ?object obj:категория_О ?categoryO . } " +
                "OPTIONAL { ?object obj:категория_С ?categoryS . } " +
                "OPTIONAL { ?object obj:категория_У ?categoryU . } " +
                "OPTIONAL { ?object obj:имеет ?accessibility . } }");

            Object results = g.ExecuteQuery(q);
            if (results is SparqlResultSet rset)
            {
                int addedCount = 0;
                int updatedCount = 0;
                int skippedCount = 0;

                foreach (SparqlResult result in rset)
                {
                    if (!result.HasValue("x") || !result.HasValue("y") || !result.HasValue("type"))
                    {
                        skippedCount++;
                        continue;
                    }

                    string iri = HttpUtility.UrlDecode(result["object"].ToString());
                    string type = HttpUtility.UrlDecode(result["type"].ToString()).Split('#').Last().Replace("_", " ");
                    string displayName = HttpUtility.UrlDecode(result["object"].ToString()).Split('#').Last().Replace("_", " ");

                    string xString = result["x"].ToString().Split('^')[0];
                    string yString = result["y"].ToString().Split('^')[0];

                    if (!double.TryParse(xString, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double xValue) ||
                        !double.TryParse(yString, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double yValue))
                    {
                        skippedCount++;
                        continue;
                    }

                    // Получаем дополнительные поля
                    string description = result.HasValue("description") ? 
                        HttpUtility.UrlDecode(result["description"].ToString()).Split('#').Last().Replace("_", " ") : 
                        "Описание не указано";
                    
                    string workingHours = result.HasValue("workingHours") ? 
                        HttpUtility.UrlDecode(result["workingHours"].ToString()).Split('#').Last().Replace("_", " ") : 
                        "График работы не указан";
                    
                    string images = result.HasValue("images") ? 
                        HttpUtility.UrlDecode(result["images"].ToString()).Split('#').Last().Replace("_", " ") : 
                        "Нет изображения";
                    
                    int? rating = result.HasValue("rating") ? 
                        Convert.ToInt32(result["rating"].ToString().Split('^')[0]) : 
                        0;

                    // Собираем категории инвалидности
                    List<string> disabilityCategories = new List<string>();
                    if (result.HasValue("categoryG")) disabilityCategories.Add("Г");
                    if (result.HasValue("categoryK")) disabilityCategories.Add("К");
                    if (result.HasValue("categoryO")) disabilityCategories.Add("О");
                    if (result.HasValue("categoryS")) disabilityCategories.Add("С");
                    if (result.HasValue("categoryU")) disabilityCategories.Add("У");

                    // Собираем элементы доступности
                    List<string> accessibilityElements = new List<string>();
                    if (result.HasValue("accessibility"))
                    {
                        string accessibility = HttpUtility.UrlDecode(result["accessibility"].ToString());
                        accessibilityElements.Add(accessibility.Split('#').Last().Replace("_", " "));
                    }

                    var existingEntity = await _context.MapObject
                        .AsNoTracking()
                        .FirstOrDefaultAsync(e => e.IRI == iri);

                    int mapObjectId;

                    if (existingEntity != null)
                    {
                        existingEntity.X = xValue;
                        existingEntity.Y = yValue;
                        existingEntity.Type = type;
                        existingEntity.Description = description;
                        existingEntity.WorkingHours = workingHours;
                        existingEntity.Images = images;
                        existingEntity.Rating = rating;

                        _context.MapObject.Update(existingEntity);
                        mapObjectId = existingEntity.Id;
                        updatedCount++;
                    }
                    else
                    {
                        var socialMapObject = new MapObject
                        {
                            Display_name = displayName,
                            X = xValue,
                            Y = yValue,
                            Type = type,
                            IRI = iri,
                            Description = description,
                            WorkingHours = workingHours,
                            Images = images,
                            Rating = rating
                        };

                        _context.MapObject.Add(socialMapObject);
                        await _context.SaveChangesAsync();
                        mapObjectId = socialMapObject.Id;
                        addedCount++;
                    }

                }

                try
                {
                    await _context.SaveChangesAsync();
                }
                catch (DbUpdateException)
                {
                    Console.WriteLine($"Ошибка при сохранении изменений");
                }
            }

            return await _context.MapObject.AsNoTracking().ToListAsync();
        }

        // Метод для извлечения объекта из БД
        [HttpGet("/GetSocialMapObject")]
        public async Task<ActionResult<IEnumerable<MapObject>>> GetSocialMapObject()
        {
            if (_context.MapObject == null)
            {
                return NotFound();
            }
            return await _context.MapObject.ToListAsync();
        }

        // Метод для извлечения координат по адресу
        [HttpGet("api/SocialMapObject/coordinates")]
        public async Task<IActionResult> GetCoordinatesAsync(string address)
        {

            if (string.IsNullOrEmpty(address))
            {
                return BadRequest("Адрес не должен быть пустым");
            }

            try
            {
                string url = $"https://nominatim.openstreetmap.org/search?q={Uri.EscapeDataString(address)}&format=json";

                HttpResponseMessage response = await _httpClient.GetAsync(url);

                if (!response.IsSuccessStatusCode)
                {
                    return StatusCode((int)response.StatusCode, "Ошибка соединения");
                }

                string responseData = await response.Content.ReadAsStringAsync();
                JArray jsonData = JArray.Parse(responseData);

                if (jsonData.Count > 0)
                {
                    var firstResult = jsonData[0];
                    double latitude = Convert.ToDouble(firstResult["lat"]);
                    double longitude = Convert.ToDouble(firstResult["lon"]);

                    return Ok(new { Latitude = latitude, Longitude = longitude });
                }
                else
                {
                    return NotFound("Координаты не найдены");
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Ошибка при получении данных: {ex.Message}");
            }
        }

        // Метод для добавления данных об оъекте со стороны клиента
        [HttpPost("/client/AddMapObject")]
        public async Task<IActionResult> AddMapObject(
            [FromForm] string name,
            [FromForm] string address,
            [FromForm] string type,
            [FromForm] string? description,
            [FromForm] List<string>? disabilityCategory,
            [FromForm] string? workingHours,
            [FromForm] List<IFormFile>? images,
            [FromForm] List<string>? accessibility,
            [FromForm] bool excluded,
            [FromForm] int? mapObjectId,
            [FromForm] int userId,
            [FromForm] double? latitude,
            [FromForm] double? longitude,
            [FromForm] string? iri,
            [FromForm] double? rating
        )
        {
            List<string> imagePaths = new List<string>();
            if (images != null)
            {
                foreach (var image in images)
                {
                    var imagesDirectory = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot/images");

                    if (!Directory.Exists(imagesDirectory))
                    {
                        Directory.CreateDirectory(imagesDirectory);
                    }

                    var filePath = Path.Combine(imagesDirectory, image.FileName);
                    using (var stream = new FileStream(filePath, FileMode.Create))
                    {
                        await image.CopyToAsync(stream);
                    }
                    imagePaths.Add(image.FileName);
                }
            }

            var user = await _context.User.FindAsync(userId);

            var mapObject = new PendingSocialMapObject
            {
                DisplayName = name,
                Address = address,
                X = longitude,
                Y = latitude,
                Type = type,
                Description = description,
                DisabilityCategory = disabilityCategory != null ? string.Join(',', disabilityCategory) : null,
                WorkingHours = workingHours,
                Accessibility = accessibility != null ? string.Join(',', accessibility) : null,
                Images = imagePaths.Count > 0 ? string.Join(',', imagePaths) : null,
                DateAdded = DateTime.UtcNow,
                Status = "Pending",
                MapObjectID = mapObjectId,
                Excluded = excluded,
                User = user,
                IRI = iri,
                Rating = rating,
            };

            _context.PendingSocialMapObject.Add(mapObject);
            await _context.SaveChangesAsync();

            return Ok();
        }

        // Поиск информации об объекте по IRI
        [HttpPost("/client/getOntologyInfo")]
        public async Task<IActionResult> GetOntologyInfo([FromForm] string iri)
        {
            try
            {
                IGraph g = new Graph();
                g.LoadFromFile("Ontology_Social_objects_new.rdf");  

                SparqlQueryParser parser = new SparqlQueryParser();

                string queryStr1 = $@"
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
                PREFIX obj: <http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#>
                SELECT ?accessibilityElement WHERE {{
                    BIND(<{iri}> AS ?individual)
                    ?individual obj:имеет ?accessibilityElement .
                }}";

                string queryStr2 = $@"
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
                PREFIX obj: <http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#>
                SELECT ?category WHERE {{
                    BIND(<{iri}> AS ?individual)
                    VALUES (?property ?categoryLabel) {{
                        (obj:категория_Г ""Г"")
                        (obj:категория_К ""К"")
                        (obj:категория_С ""С"")
                        (obj:категория_У ""У"")
                        (obj:категория_О ""О"")
                    }}
                    ?individual ?property true .
                    BIND(?categoryLabel AS ?category)
                }}";

                SparqlQuery query1 = parser.ParseFromString(queryStr1);
                Object results1 = g.ExecuteQuery(query1);
                List<string> accessibilityElements = new List<string>();

                if (results1 is SparqlResultSet rset1)
                {
                    foreach (SparqlResult result in rset1)
                    {
                        foreach (var variable in result.Variables)
                        {
                            string elementUri = result[variable].ToString();
                            string decodedString = HttpUtility.UrlDecode(elementUri);
                            string elementName = decodedString.Replace("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#", "").Replace("_", " ");
                            accessibilityElements.Add(elementName);
                        }
                    }
                }

                SparqlQuery query2 = parser.ParseFromString(queryStr2);
                Object results2 = g.ExecuteQuery(query2);
                List<string> categories = new List<string>();

                if (results2 is SparqlResultSet rset2)
                {
                    foreach (SparqlResult result in rset2)
                    {
                        foreach (var variable in result.Variables)
                        {
                            string category = result[variable].ToString();
                            string decodedCategory = HttpUtility.UrlDecode(category);
                            string categoryName = decodedCategory.Replace("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#", "").Replace("_", " ");
                            categories.Add(categoryName);
                        }
                    }
                }

                return Ok(new { AccessibilityElements = accessibilityElements, Categories = categories });
            }
            catch (Exception ex)
            {
                return BadRequest($"Ошибка при выполнении запроса: {ex.Message}");
            }
        }

        // Метод для извлечения списка элементов доступной среды из онтологии
        [HttpGet("get/accessibility")]
        public async Task<ActionResult<IEnumerable<string>>> GetAccessibilityElements()
        {
            try
            {
                IGraph g = new Graph();
                g.LoadFromFile("Ontology_Social_objects_new.rdf");

                SparqlQueryParser parser = new SparqlQueryParser();

                string queryStr = @"
                    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
                    PREFIX obj: <http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#>
                    SELECT ?subject WHERE { ?subject rdf:type obj:Элемент_доступной_среды . }";

                SparqlQuery query = parser.ParseFromString(queryStr);

                Object results = g.ExecuteQuery(query);
                List<string> accessibilityElements = new List<string>();

                if (results is SparqlResultSet rset)
                {
                    foreach (SparqlResult result in rset)
                    {
                        foreach (var variable in result.Variables)
                        {
                            string elementUri = result[variable].ToString();
                            string decodedString = HttpUtility.UrlDecode(elementUri);
                            string elementName = decodedString.Replace("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#", "").Replace("_", " ");
                            accessibilityElements.Add(elementName);
                        }
                    }
                }

                return Ok(accessibilityElements);
            }
            catch (Exception ex)
            {
                return BadRequest($"Ошибка при выполнении запроса: {ex.Message}");
            }
        }

        // Метод для извлечения типов объектов социальной инфраструктуры
        [HttpGet("get/socialInfrastructureTypes")]
        public async Task<ActionResult<IEnumerable<string>>> GetSocialInfrastructureTypes()
        {
            try
            {
                IGraph g = new Graph();
                g.LoadFromFile("C:/Users/safon/Downloads/MapApplication-master/MapApplication-master/MapApi/Ontology_Social_objects_new.rdf");

                SparqlQueryParser parser = new SparqlQueryParser();

                string queryStr = @"
                    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
                    PREFIX owl: <http://www.w3.org/2002/07/owl#>
                    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
                    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
                    PREFIX obj: <http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#>
                    SELECT ?type
                    WHERE { 
                        ?type rdfs:subClassOf obj:Объект_социальной_инфраструктуры 
                    }";

                SparqlQuery query = parser.ParseFromString(queryStr);

                Object results = g.ExecuteQuery(query);
                List<string> socialInfrastructureTypes = new List<string>();

                if (results is SparqlResultSet rset)
                {
                    foreach (SparqlResult result in rset)
                    {
                        foreach (var variable in result.Variables)
                        {
                            string typeUri = result[variable].ToString();
                            string decodedString = HttpUtility.UrlDecode(typeUri);
                            string typeName = decodedString.Replace("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#", "").Replace("_", " ");
                            socialInfrastructureTypes.Add(typeName);
                        }
                    }
                }

                return Ok(socialInfrastructureTypes);
            }
            catch (Exception ex)
            {
                return BadRequest($"Ошибка при выполнении запроса: {ex.Message}");
            }
        }

        // Метод извлечения объекта из БД по ID
        [HttpGet("GetSocialMapObjectById/{id}")]
        public async Task<ActionResult<MapObject>> GetSocialMapObjectById(int id)
        {
            var socialMapObject = await _context.MapObject.FindAsync(id);
            if (socialMapObject == null)
            {
                return NotFound();
            }
            return socialMapObject;
        }

        // Метод для осуществления поиска объекта
        [HttpGet("SearchBy")]
        public async Task<ActionResult<IEnumerable<MapObject>>> SearchBy(string search)
        {
            if (string.IsNullOrWhiteSpace(search))
            {
                return await _context.MapObject.ToListAsync();
            }

            search = search.ToLower();
            return await _context.MapObject
                .Where(x => EF.Functions.Like(x.Display_name.ToLower(), $"%{search}%") ||
                            EF.Functions.Like(x.Adress.ToLower(), $"%{search}%"))
                .ToListAsync();
        }

        // Метод для удаления объекта по ID 
        [HttpDelete("DeleteById/{id}")]
        public async Task<ActionResult> Delete(int id)
        {
            var socialMapObject = await _context.MapObject.FindAsync(id);

            if (socialMapObject == null)
            {
                return NotFound();
            }

            _context.MapObject.Remove(socialMapObject);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // Метод для добавления объекта
        [HttpPut("PutById/{id}")]
        public async Task<ActionResult> Put(int id, MapObject socialMapObject)
        {
            if (id != socialMapObject.Id)
            {
                return BadRequest();
            }

            _context.Entry(socialMapObject).State = EntityState.Modified;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!SocialMapObjectExists(id))
                {
                    return NotFound();
                }
                else
                {
                    throw;
                }
            }

            return NoContent();
        }

        // Метод для определения существования объекта
        private bool SocialMapObjectExists(int id)
        {
            return (_context.MapObject?.Any(e => e.Id == id)).GetValueOrDefault();
        }

        // Метод для обновления онтологии данными из БД
        [HttpGet]
        [Route("/UpdateOntologyFromDatabase")]
        public async Task<ActionResult> UpdateOntologyFromDatabase()
        {
            try
            {
                IGraph g = new Graph();
                string ontologyPath = "Ontology_Social_objects_new.rdf";
                
                if (!System.IO.File.Exists(ontologyPath))
                {
                    return BadRequest($"Файл онтологии не найден по пути: {Path.GetFullPath(ontologyPath)}");
                }

                g.LoadFromFile(ontologyPath);

                var mapObjects = await _context.MapObject
                    .AsNoTracking()
                    .Select(m => new
                    {
                        m.Id,
                        m.Display_name,
                        IRI = m.IRI ?? string.Empty,
                        m.Type,
                        m.X,
                        m.Y
                    })
                    .ToListAsync();

                int updatedCount = 0;
                int skippedCount = 0;
                int newObjectsCount = 0;
                var errors = new List<string>();

                foreach (var mapObject in mapObjects)
                {
                    try
                    {
                        // Проверяем наличие необходимых данных
                        if (mapObject == null)
                        {
                            errors.Add("Найден null объект в базе данных");
                            continue;
                        }

                        if (string.IsNullOrEmpty(mapObject.Display_name))
                        {
                            errors.Add($"Объект с ID {mapObject.Id} не имеет имени");
                            continue;
                        }

                        // Если IRI отсутствует или пустой, создаем новый объект в онтологии
                        if (string.IsNullOrEmpty(mapObject.IRI))
                        {
                            try
                            {
                                // Создаем уникальный IRI на основе Display_name и ID
                                string newIri = $"http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#{mapObject.Display_name.Replace(" ", "_")}_{mapObject.Id}";
                                
                                // Создаем новый объект в онтологии
                                var objectUri = new Uri(newIri);
                                var objectNode = g.CreateUriNode(objectUri);

                                // Добавляем тип объекта
                                var typeNode = g.CreateUriNode(new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#Объект_социальной_инфраструктуры"));
                                g.Assert(new Triple(objectNode, g.CreateUriNode(new Uri("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")), typeNode));

                                // Добавляем координаты
                                var xNode = g.CreateLiteralNode(mapObject.X.ToString(), new Uri("http://www.w3.org/2001/XMLSchema#double"));
                                var yNode = g.CreateLiteralNode(mapObject.Y.ToString(), new Uri("http://www.w3.org/2001/XMLSchema#double"));
                                g.Assert(new Triple(objectNode, g.CreateUriNode(new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#X")), xNode));
                                g.Assert(new Triple(objectNode, g.CreateUriNode(new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#Y")), yNode));

                                // Добавляем тип объекта, если он указан
                                if (!string.IsNullOrEmpty(mapObject.Type))
                                {
                                    var specificTypeNode = g.CreateUriNode(new Uri($"http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#{mapObject.Type.Replace(" ", "_")}"));
                                    g.Assert(new Triple(objectNode, g.CreateUriNode(new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#является")), specificTypeNode));
                                }

                                // Обновляем IRI в базе данных
                                var dbObject = await _context.MapObject.FindAsync(mapObject.Id);
                                if (dbObject != null)
                                {
                                    dbObject.IRI = newIri;
                                    _context.MapObject.Update(dbObject);
                                }

                                newObjectsCount++;
                            }
                            catch (Exception ex)
                            {
                                errors.Add($"Ошибка при создании нового объекта в онтологии для {mapObject.Id}: {ex.Message}");
                                continue;
                            }
                        }
                        else
                        {
                            try
                            {
                                // Обновляем существующий объект в онтологии
                                var objectUri = new Uri(mapObject.IRI);
                                var objectNode = g.CreateUriNode(objectUri);

                                // Обновляем координаты
                                var xNode = g.CreateLiteralNode(mapObject.X.ToString(), new Uri("http://www.w3.org/2001/XMLSchema#double"));
                                var yNode = g.CreateLiteralNode(mapObject.Y.ToString(), new Uri("http://www.w3.org/2001/XMLSchema#double"));
                                
                                // Удаляем старые значения координат
                                var xTriples = g.GetTriplesWithSubjectPredicate(objectNode, g.CreateUriNode(new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#X"))).ToList();
                                var yTriples = g.GetTriplesWithSubjectPredicate(objectNode, g.CreateUriNode(new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#Y"))).ToList();
                                
                                foreach (var triple in xTriples)
                                {
                                    g.Retract(triple);
                                }
                                foreach (var triple in yTriples)
                                {
                                    g.Retract(triple);
                                }

                                // Добавляем новые значения координат
                                g.Assert(new Triple(objectNode, g.CreateUriNode(new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#X")), xNode));
                                g.Assert(new Triple(objectNode, g.CreateUriNode(new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#Y")), yNode));

                                // Обновляем тип объекта
                                if (!string.IsNullOrEmpty(mapObject.Type))
                                {
                                    var typeTriples = g.GetTriplesWithSubjectPredicate(objectNode, g.CreateUriNode(new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#является"))).ToList();
                                    foreach (var triple in typeTriples)
                                    {
                                        g.Retract(triple);
                                    }

                                    var typeNode = g.CreateUriNode(new Uri($"http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#{mapObject.Type.Replace(" ", "_")}"));
                                    g.Assert(new Triple(objectNode, g.CreateUriNode(new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#является")), typeNode));
                                }

                                updatedCount++;
                            }
                            catch (Exception ex)
                            {
                                errors.Add($"Ошибка при обновлении объекта {mapObject.Id} в онтологии: {ex.Message}");
                                skippedCount++;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        errors.Add($"Ошибка при обработке объекта {mapObject?.Id}: {ex.Message}");
                        skippedCount++;
                    }
                }

                // Сохраняем изменения в базе данных
                try
                {
                    await _context.SaveChangesAsync();
                }
                catch (Exception ex)
                {
                    errors.Add($"Ошибка при сохранении изменений в БД: {ex.Message}");
                }

                // Сохраняем обновленную онтологию
                try
                {
                    // Дополнительные проверки перед сохранением
                    if (g == null)
                    {
                        errors.Add("Ошибка: Объект графа онтологии равен null перед сохранением.");
                    }
                    else if (string.IsNullOrEmpty(ontologyPath))
                    {
                         errors.Add("Ошибка: Путь к файлу онтологии пустой перед сохранением.");
                    }
                    else
                    {
                        // Логирование состояния графа перед сохранением
                        Console.WriteLine($"Debug: Объект графа g не null. Количество триплетов: {g.Triples.Count}");

                        // Сохраняем в поток в памяти сначала (в формате Turtle)
                        var tempStream = new System.IO.MemoryStream();
                        var writer = new VDS.RDF.Writing.CompressingTurtleWriter(); // Используем CompressingTurtleWriter
                        using (var streamWriter = new System.IO.StreamWriter(tempStream, System.Text.Encoding.UTF8, leaveOpen: true))
                        {
                           writer.Save(g, streamWriter);
                        }
                        
                        // Перематываем поток и сохраняем в файл
                        tempStream.Seek(0, System.IO.SeekOrigin.Begin);
                        // Возможно, стоит сохранить в файл с другим расширением (.ttl)
                        string turtleOntologyPath = Path.ChangeExtension(ontologyPath, ".ttl");
                        using (var fileStream = new System.IO.FileStream(turtleOntologyPath, System.IO.FileMode.Create, System.IO.FileAccess.Write))
                        {
                            tempStream.CopyTo(fileStream);
                        }

                        Console.WriteLine($"Debug: Онтология успешно сохранена во временный поток (Turtle) и файл {turtleOntologyPath}.");
                    }
                }
                catch (Exception ex)
                {
                    errors.Add($"Ошибка при сохранении онтологии (Turtle): {ex.Message}");
                    Console.WriteLine($"Debug: Ошибка при сохранении онтологии (Turtle): {ex.Message}");
                }

                return Ok(new { 
                    Message = "Онтология успешно обновлена", 
                    UpdatedCount = updatedCount, 
                    NewObjectsCount = newObjectsCount,
                    SkippedCount = skippedCount,
                    Errors = errors
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { 
                    Message = "Ошибка при обновлении онтологии", 
                    Error = ex.Message,
                    StackTrace = ex.StackTrace
                });
            }
        }

        // Метод для проверки прав на запись файла онтологии
        [HttpGet]
        [Route("/CheckOntologyFilePermissions")]
        public ActionResult CheckOntologyFilePermissions()
        {
            try
            {
                string ontologyFilePath = "Ontology_Social_objects_new.rdf";
                string fullPath = Path.GetFullPath(ontologyFilePath);

                var result = new
                {
                    FileExists = System.IO.File.Exists(ontologyFilePath),
                    FullPath = fullPath,
                    CanRead = System.IO.File.Exists(ontologyFilePath) ? true : false,
                    CanWrite = System.IO.File.Exists(ontologyFilePath) ? 
                        (System.IO.File.GetAttributes(ontologyFilePath) & FileAttributes.ReadOnly) != FileAttributes.ReadOnly : false,
                    DirectoryExists = Directory.Exists(Path.GetDirectoryName(fullPath)),
                    DirectoryWritable = Directory.Exists(Path.GetDirectoryName(fullPath)) ? 
                        (System.IO.File.GetAttributes(Path.GetDirectoryName(fullPath)) & FileAttributes.ReadOnly) != FileAttributes.ReadOnly : false
                };

                return Ok(result);
            }
            catch (Exception ex)
            {
                return BadRequest($"Ошибка при проверке прав доступа: {ex.Message}");
            }
        }

        // Метод для проверки данных в таблице MapObject
        [HttpGet]
        [Route("/CheckMapObjectData")]
        public async Task<ActionResult> CheckMapObjectData()
        {
            try
            {
                // Получаем данные через LINQ с явным указанием, что IRI может быть null
                var result = await _context.MapObject
                    .AsNoTracking()
                    .Select(m => new
                    {
                        m.Id,
                        m.Display_name,
                        IRI = m.IRI ?? string.Empty,
                        m.Type,
                        m.X,
                        m.Y
                    })
                    .ToListAsync();

                var nullIriCount = result.Count(m => string.IsNullOrEmpty(m.IRI));
                var totalCount = result.Count;

                return Ok(new
                {
                    TotalRecords = totalCount,
                    NullIriCount = nullIriCount,
                    Records = result
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new
                {
                    Message = "Ошибка при проверке данных",
                    Error = ex.Message,
                    StackTrace = ex.StackTrace
                });
            }
        }

        // Вспомогательный класс для проверки данных
        private class MapObjectDataCheck
        {
            public int Id { get; set; }
            public string Display_name { get; set; }
            public string IRI { get; set; }
            public string Type { get; set; }
            public double X { get; set; }
            public double Y { get; set; }
        }

        // Метод для утверждения заявки и добавления/обновления в БД и онтологии
        [HttpPost]
        [Route("/expert/ApprovePendingMapObject")]
        public async Task<IActionResult> ApprovePendingMapObject([FromForm] int pendingObjectId)
        {
            try
            {
                var pendingObject = await _context.PendingSocialMapObject.FindAsync(pendingObjectId);

                if (pendingObject == null)
                {
                    return NotFound("Заявка не найдена.");
                }

                // 1. Добавление/обновление в БД (таблица MapObject)
                MapObject mapObject;

                if (pendingObject.MapObjectID.HasValue && pendingObject.MapObjectID.Value > 0)
                {
                    // Если заявка связана с существующим объектом из онтологии, обновляем его
                    mapObject = await _context.MapObject.FindAsync(pendingObject.MapObjectID.Value);
                    if (mapObject == null)
                    {
                         // Если объект не найден по MapObjectID, возможно, его удалили из MapObject, но он остался в Pending
                         // В таком случае создадим новый объект в MapObject
                         mapObject = new MapObject();
                         _context.MapObject.Add(mapObject);
                    } else {
                         _context.MapObject.Update(mapObject);
                    }
                }
                else
                {
                    // Если заявка на новый объект, создаем его в MapObject
                    mapObject = new MapObject();
                    _context.MapObject.Add(mapObject);
                }
                
                // Обновляем данные объекта MapObject из заявки
                mapObject.Display_name = pendingObject.DisplayName;
                mapObject.Adress = pendingObject.Address; // предполагаем, что у MapObject есть поле Adress
                mapObject.X = pendingObject.X ?? 0; // Присваиваем 0 если координаты null
                mapObject.Y = pendingObject.Y ?? 0; // Присваиваем 0 если координаты null
                mapObject.Type = pendingObject.Type;

                // Обработка IRI: если это новый объект, генерируем IRI; если обновление существующего, берем IRI из MapObject
                if (!pendingObject.MapObjectID.HasValue || pendingObject.MapObjectID.Value <= 0)
                {
                    // Это новая заявка, генерируем IRI
                     mapObject.IRI = $"http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#{pendingObject.DisplayName.Replace(" ", "_")}_{pendingObject.Id}"; // Генерируем новый IRI на основе ID pendingObject пока что, будет обновлен после SaveChanges
                }
                // Если MapObjectID есть, IRI берется из загруженного ранее mapObject

                // !!! Возможно, потребуется маппинг других полей из PendingSocialMapObject в MapObject !!!
                // Например: Description, DisabilityCategory, WorkingHours, Accessibility, Images, Excluded
                // Убедитесь, что таблица MapObject имеет соответствующие поля или добавьте их.

                await _context.SaveChangesAsync(); // Сохраняем в БД, чтобы получить актуальный ID для нового объекта MapObject, если он был создан

                // Теперь, если это был новый объект, обновляем IRI на основе ID mapObject
                if (!pendingObject.MapObjectID.HasValue || pendingObject.MapObjectID.Value <= 0)
                {
                     mapObject.IRI = $"http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#{mapObject.Display_name.Replace(" ", "_")}_{mapObject.Id}"; // Генерируем новый IRI на основе ID mapObject
                     _context.MapObject.Update(mapObject);
                     await _context.SaveChangesAsync(); // Сохраняем обновленный IRI в БД
                }

                // 2. Обновление/создание в онтологии
                IGraph g = new Graph();
                string ontologyPath = "Ontology_Social_objects_new.ttl"; // Используем .ttl
                
                if (!System.IO.File.Exists(ontologyPath))
                {
                    // Если файл онтологии не существует, создаем новый пустой граф
                    g.CreateUriNode(new Uri("http://example.org/base")); // Добавляем базовый URI, чтобы граф не был пустым
                }
                else
                {
                   VDS.RDF.Parsing.FileLoader.Load(g, ontologyPath, new VDS.RDF.Parsing.TurtleParser()); // Загружаем из .ttl с помощью TurtleParser
                }

                // Создаем/обновляем узел для объекта в онтологии
                var objectUri = new Uri(mapObject.IRI);
                var objectNode = g.CreateUriNode(objectUri);

                // Удаляем старые координаты и тип, если они существуют для данного IRI
                var propertiesToRemove = new List<Uri> // Список URI свойств для удаления
                {
                    new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#X"),
                    new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#Y"),
                    new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#является"),
                    new Uri("http://www.w3.org/1999/02/22-rdf-syntax-ns#type") // Удаляем старые rdf:type, кроме основного
                };

                foreach(var propUri in propertiesToRemove)
                {
                     var triplesToRemove = g.GetTriplesWithSubjectPredicate(objectNode, g.CreateUriNode(propUri)).ToList();
                     foreach(var triple in triplesToRemove)
                     {
                         g.Retract(triple);
                     }
                }

                 // Добавляем/обновляем координаты
                var xNode = g.CreateLiteralNode(mapObject.X.ToString(), new Uri("http://www.w3.org/2001/XMLSchema#double"));
                var yNode = g.CreateLiteralNode(mapObject.Y.ToString(), new Uri("http://www.w3.org/2001/XMLSchema#double"));
                g.Assert(new Triple(objectNode, g.CreateUriNode(new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#X")), xNode));
                g.Assert(new Triple(objectNode, g.CreateUriNode(new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#Y")), yNode));

                // Добавляем тип объекта (rdf:type) - основной тип
                var mainTypeNode = g.CreateUriNode(new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#Объект_социальной_инфраструктуры"));
                g.Assert(new Triple(objectNode, g.CreateUriNode(new Uri("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")), mainTypeNode));

                // Добавляем конкретный тип объекта (является), если указан
                if (!string.IsNullOrEmpty(mapObject.Type))
                {
                    var specificTypeNode = g.CreateUriNode(new Uri($"http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#{mapObject.Type.Replace(" ", "_")}"));
                    g.Assert(new Triple(objectNode, g.CreateUriNode(new Uri("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#является")), specificTypeNode));
                }

                // !!! Здесь можно добавить логику для обновления других свойств в онтологии,
                // например, доступность (Accessibility), категории инвалидности (DisabilityCategory) и т.д.
                // Вам нужно будет определить, как эти данные мапятся на свойства в вашей онтологии.

                // Сохраняем обновленную онтологию в файл .ttl
                var writer = new VDS.RDF.Writing.CompressingTurtleWriter();
                writer.Save(g, ontologyPath);

                // 3. Удаление из PendingSocialMapObject
                _context.PendingSocialMapObject.Remove(pendingObject);
                await _context.SaveChangesAsync();

                return Ok("Заявка успешно утверждена и данные добавлены/обновлены в БД и онтологии.");
            }
            catch (Exception ex)
            {
                // Логирование ошибок
                Console.WriteLine($"Ошибка при утверждении заявки {pendingObjectId}: {ex.Message}");
                Console.WriteLine(ex.StackTrace);
                return StatusCode(500, $"Ошибка при утверждении заявки: {ex.Message}");
            }
        }
    }
}
