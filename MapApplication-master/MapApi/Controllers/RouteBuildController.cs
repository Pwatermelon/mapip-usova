using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;

namespace MapApi.Controllers
{
    /// <summary>
    /// Построение маршрута через OpenRouteService (по курсовой: выбор двух точек, профиль колясочник/пешеход).
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class RouteBuildController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly IHttpClientFactory _httpClientFactory;

        public RouteBuildController(IConfiguration config, IHttpClientFactory httpClientFactory)
        {
            _config = config;
            _httpClientFactory = httpClientFactory;
        }

        /// <summary>
        /// Построить маршрут между двумя точками (координаты [широта, долгота], профиль: wheelchair или foot-walking).
        /// </summary>
        [HttpPost("Build")]
        public async Task<IActionResult> BuildRoute([FromBody] BuildRouteRequest request)
        {
            var apiKey = _config["OpenRouteService:ApiKey"];
            if (string.IsNullOrEmpty(apiKey))
                return BadRequest(new { error = "Не настроен ключ OpenRouteService. Добавьте OpenRouteService:ApiKey в appsettings.json или переменные окружения." });

            if (request?.From == null || request.From.Length != 2 || request.To == null || request.To.Length != 2)
                return BadRequest(new { error = "Укажите точки From и To как [широта, долгота]." });

            var profile = (request.Profile ?? "foot-walking").ToLowerInvariant();
            if (profile != "wheelchair" && profile != "foot-walking" && profile != "driving-car")
                profile = "foot-walking";

            // OpenRouteService: coordinates в формате [lon, lat]
            var coordinates = new[] {
                new[] { request.From[1], request.From[0] },
                new[] { request.To[1], request.To[0] }
            };

            var alt = request.AlternativeCount ?? 1;
            if (alt < 1) alt = 1;
            if (alt > 3) alt = 3;

            // ORS ждёт snake_case в JSON; Dictionary сохраняет имена ключей как заданы.
            var client = _httpClientFactory.CreateClient();
            // GeoJSON: координаты линии в явном виде (проще и надёжнее, чем encoded polyline в /json).
            var url = $"https://api.openrouteservice.org/v2/directions/{profile}/geojson?api_key={apiKey}";
            HttpResponseMessage response;
            if (alt > 1)
            {
                var body = new Dictionary<string, object?>
                {
                    ["coordinates"] = coordinates,
                    ["options"] = new Dictionary<string, object?>
                    {
                        ["alternative_routes"] = new Dictionary<string, object?>
                        {
                            ["target_count"] = alt,
                            ["weight_factor"] = 1.45
                        }
                    }
                };
                response = await client.PostAsJsonAsync(url, body);
                if (!response.IsSuccessStatusCode)
                {
                    await response.Content.ReadAsStringAsync();
                    response.Dispose();
                    body = new Dictionary<string, object?> { ["coordinates"] = coordinates };
                    response = await client.PostAsJsonAsync(url, body);
                }
            }
            else
            {
                response = await client.PostAsJsonAsync(url, new { coordinates });
            }

            if (!response.IsSuccessStatusCode)
            {
                var err = await response.Content.ReadAsStringAsync();
                return StatusCode((int)response.StatusCode, new { error = "OpenRouteService: " + err });
            }

            var json = await response.Content.ReadAsStringAsync();
            return Content(json, "application/json");
        }

        public class BuildRouteRequest
        {
            /// <summary>Координаты [широта, долгота]. В JSON — camelCase: "from".</summary>
            [JsonPropertyName("from")]
            public double[] From { get; set; } = null!;

            [JsonPropertyName("to")]
            public double[] To { get; set; } = null!;

            [JsonPropertyName("profile")]
            public string? Profile { get; set; } // wheelchair | foot-walking | driving-car

            /// <summary>Сколько вариантов маршрута запросить у ORS (1–3). 1 — без alternative_routes.</summary>
            [JsonPropertyName("alternativeCount")]
            public int? AlternativeCount { get; set; }
        }
    }
}
