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
            if (profile != "wheelchair" && profile != "foot-walking")
                profile = "foot-walking";

            // OpenRouteService: coordinates в формате [lon, lat]
            var coordinates = new[] {
                new[] { request.From[1], request.From[0] },
                new[] { request.To[1], request.To[0] }
            };

            var body = new { coordinates };
            var client = _httpClientFactory.CreateClient();
            var url = $"https://api.openrouteservice.org/v2/directions/{profile}/json?api_key={apiKey}";
            var response = await client.PostAsJsonAsync(url, body);
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
            public double[] From { get; set; } = null!; // [lat, lon]
            public double[] To { get; set; } = null!;
            public string? Profile { get; set; } // wheelchair | foot-walking
        }
    }
}
