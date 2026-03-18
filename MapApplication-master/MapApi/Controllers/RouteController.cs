using MapApi.Context;
using MapApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MapApi.Controllers
{
    [Route("api/routes")]
    [ApiController]
    public class RouteController : Controller
    {

        private readonly ApplicationContext _context;

        public RouteController(ApplicationContext context)
        {
            _context = context;
        }

        // Метод для извлечения списка маршрутов
        [HttpGet("GetRoutes")]
        public async Task<ActionResult<IEnumerable<Models.Route>>> GetRoutes()
        {
            if (_context.Route == null)
            {
                return NotFound();
            }
            return await _context.Route.ToListAsync();
        }

        /// <summary>
        /// Маршруты с признаком наличия данных о доступности: один цвет — с данными, другой — без.
        /// </summary>
        [HttpGet("GetRoutesWithDataStatus")]
        public async Task<ActionResult<IEnumerable<RouteWithDataStatusDto>>> GetRoutesWithDataStatus()
        {
            if (_context.Route == null)
                return NotFound();

            var routes = await _context.Route
                .Include(r => r.ListObjects)
                .ToListAsync();

            var result = routes.Select(r => new RouteWithDataStatusDto
            {
                Id = r.Id,
                Date = r.Date,
                UserId = r.UserId,
                HasAccessibilityData = r.ListObjects != null && r.ListObjects.Count > 0,
                ObjectsCount = r.ListObjects?.Count ?? 0,
                ListObjects = r.ListObjects?.Select(o => new RoutePointDto { Id = o.Id, X = o.X, Y = o.Y, DisplayName = o.Display_name }).ToList() ?? new List<RoutePointDto>()
            }).ToList();

            return Ok(result);
        }

        // Метод для добавления маршрута в БД  
        [HttpPost("AddRoute/{date}")]
        public async Task<IActionResult> AddRoute(string date)
        {
            var route = new Models.Route
            {
                Date = date
            };
            await _context.Route.AddAsync(route);
            await _context.SaveChangesAsync();

            return Ok();
        }

        // Метод для извлечения маршрута по ID с объектами (для отрисовки на карте)
        [HttpGet("GetRouteById/{id}")]
        public async Task<ActionResult<Models.Route>> GetRouteById(int id)
        {
            var route = await _context.Route
                .Include(r => r.ListObjects)
                .FirstOrDefaultAsync(r => r.Id == id);
            if (route == null)
            {
                return NotFound();
            }
            return route;
        }

        // Метод для удаления маршрута по ID
        [HttpDelete("Delete/{id}")]
        public async Task<ActionResult> Delete(int id)
        {
            var route = await _context.Route.FindAsync(id);

            if (route == null)
            {
                return NotFound();
            }

            _context.Route.Remove(route);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // Метод для добавления маршрута в БД
        [HttpPut("Put/{id}")]
        public async Task<ActionResult> Put(int id, Models.Route route)
        {
            if (id != route.Id)
            {
                return BadRequest();
            }

            _context.Entry(route).State = EntityState.Modified;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!RouteExists(id))
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

        // Метод для определения существования маршрута
        private bool RouteExists(int id)
        {
            return (_context.Route?.Any(e => e.Id == id)).GetValueOrDefault();
        }

        public class RouteWithDataStatusDto
        {
            public int Id { get; set; }
            public string Date { get; set; } = null!;
            public int UserId { get; set; }
            public bool HasAccessibilityData { get; set; }
            public int ObjectsCount { get; set; }
            public List<RoutePointDto> ListObjects { get; set; } = new List<RoutePointDto>();
        }

        public class RoutePointDto
        {
            public int Id { get; set; }
            public double X { get; set; }
            public double Y { get; set; }
            public string? DisplayName { get; set; }
        }
    }
}
