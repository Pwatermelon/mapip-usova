using MapApi.Context;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Npgsql;
using MapApi.Models;
using System.Web;
using VDS.RDF.Parsing;
using VDS.RDF.Query;
using VDS.RDF;

namespace MapApi.Controllers
{
    [ApiController]
    [Route("api/admin")]
    public class AdminController : ControllerBase
    {
        private readonly string _connectionString;
        private readonly ApplicationContext _context;

        public AdminController(ApplicationContext context, IConfiguration configuration)
        {
            _context = context;
            _connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? "Host=db;Port=5432;Username=postgres;Password=12345;Database=map";
        }

        // Получение параметров рекомендательной системы
        [HttpGet("GetSettings")]
        public async Task<ActionResult<AdminSettingsRequest>> GetSettings()
        {
            var settings = new AdminSettingsRequest();

            using (var connection = new NpgsqlConnection(_connectionString))
            {
                await connection.OpenAsync();

                using (var command = new NpgsqlCommand("SELECT \"RnValue\", \"ExcludedCategories\", \"CronExpression\" FROM public.\"AdminSettings\" LIMIT 1", connection))
                {
                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        if (await reader.ReadAsync())
                        {
                            settings.RnValue = reader.GetInt32(0);
                            settings.ExcludedCategories = reader.IsDBNull(1) ? new List<string>() : new List<string>(reader.GetString(1).Split(','));
                            settings.CronExpression = reader.GetString(2);
                        }
                    }
                }
            }

            return Ok(settings);
        }
        
        // Получение значения cron-выражения
        [HttpGet("settings/GetCronExpression")]
        public async Task<ActionResult<string>> GetCronExpression()
        {
            string cronExpression = string.Empty;

            using (var connection = new NpgsqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var command = new NpgsqlCommand("SELECT \"CronExpression\" FROM public.\"AdminSettings\" LIMIT 1", connection))
                {
                    cronExpression = (string)await command.ExecuteScalarAsync();
                }
            }

            return Ok(cronExpression);
        }

        // Обновление параметра, отвечающего за извлечение количества последних посещенных объектов
        [HttpPost("settings/UpdateRnValue")]
        public async Task<ActionResult> UpdateRnValue([FromBody] RnValueRequest request)
        {
            using (var connection = new NpgsqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var command = new NpgsqlCommand("UPDATE public.\"AdminSettings\" SET \"RnValue\" = @rnValue", connection))
                {
                    command.Parameters.AddWithValue("rnValue", request.RnValue);
                    await command.ExecuteNonQueryAsync();
                }
            }

            return Ok();
        }

        // Обновление исключенных категорий из генерации рекомендаций
        [HttpPost("settings/UpdateExcludedCategories")]
        public async Task<ActionResult> UpdateExcludedCategories([FromBody] ExcludedCategoriesRequest request)
        {
            using (var connection = new NpgsqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var command = new NpgsqlCommand("UPDATE public.\"AdminSettings\" SET \"ExcludedCategories\" = @excludedCategories", connection))
                {
                    command.Parameters.AddWithValue("excludedCategories", string.Join(",", request.ExcludedCategories));
                    await command.ExecuteNonQueryAsync();
                }
            }

            return Ok();
        }

        // Обновление значения cron-выражения
        [HttpPost("settings/UpdateCronExpression")]
        public async Task<IActionResult> UpdateCronExpression([FromBody] CronExpressionRequest cronExpressionRequest)
        {
            if (string.IsNullOrEmpty(cronExpressionRequest.CronExpression))
            {
                return BadRequest("Cron expression cannot be empty.");
            }

            using (var connection = new NpgsqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var command = new NpgsqlCommand("UPDATE public.\"AdminSettings\" SET \"CronExpression\" = @cronExpression", connection))
                {
                    command.Parameters.AddWithValue("@cronExpression", cronExpressionRequest.CronExpression);
                    await command.ExecuteNonQueryAsync();
                }
            }

            return Ok();
        }

        [HttpGet("get/infrastructure")]
        public async Task<ActionResult<Dictionary<string, List<string>>>> GetInfrastructureElements()
        {
            try
            {
                IGraph g = new Graph();
                g.LoadFromFile("Ontology_Social_objects_new.rdf");

                SparqlQueryParser parser = new SparqlQueryParser();
                string queryStr = @"
                    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
                    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
                    PREFIX obj: <http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#>

                    SELECT ?type ?category
                    WHERE { 
                        ?type rdfs:subClassOf obj:Объект_социальной_инфраструктуры .
                        ?category rdf:type ?type .
                    }";

                SparqlQuery query = parser.ParseFromString(queryStr);

                Object results = g.ExecuteQuery(query);
                Dictionary<string, List<string>> infrastructureElements = new Dictionary<string, List<string>>();

                if (results is SparqlResultSet rset)
                {
                    foreach (SparqlResult result in rset)
                    {
                        string typeUri = result["type"].ToString();
                        string categoryUri = result["category"].ToString();

                        string typeName = HttpUtility.UrlDecode(typeUri)
                            .Replace("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#", "")
                            .Replace("_", " ");

                        string categoryName = HttpUtility.UrlDecode(categoryUri)
                            .Replace("http://www.semanticweb.org/алексей/ontologies/2023/8/untitled-ontology-44#", "")
                            .Replace("_", " ");

                        if (!infrastructureElements.ContainsKey(typeName))
                        {
                            infrastructureElements[typeName] = new List<string>();
                        }

                        infrastructureElements[typeName].Add(categoryName);
                    }
                }

                return Ok(infrastructureElements);
            }
            catch (Exception ex)
            {
                return BadRequest($"Ошибка при выполнении запроса: {ex.Message}");
            }
        }

    }

    public class AdminSettingsRequest
    {
        public int RnValue { get; set; }
        public List<string> ExcludedCategories { get; set; } = new List<string>();
        public string CronExpression { get; set; }
    }

    public class CronExpressionRequest
    {
        public string CronExpression { get; set; }
    }

    public class RnValueRequest
    {
        public int RnValue { get; set; }
    }

    public class ExcludedCategoriesRequest
    {
        public List<string> ExcludedCategories { get; set; }
    }
}