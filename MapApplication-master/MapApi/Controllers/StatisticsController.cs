using Microsoft.AspNetCore.Mvc;
using MapApi.Models;
using MapApi.Context;
using Microsoft.EntityFrameworkCore;

namespace MapApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class StatisticsController : ControllerBase
    {
        private readonly ApplicationContext _context;

        public StatisticsController(ApplicationContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetStatistics()
        {
            var pendingCount = await _context.PendingSocialMapObject
                .Where(o => o.Status == "Pending")
                .CountAsync();

            var addedCount = await _context.MapObject
                .Where(o => o.CreatedAt >= DateTime.UtcNow.AddDays(-30))
                .CountAsync();

            var deletedCount = await _context.PendingSocialMapObject
                .Where(o => o.Status == "Rejected")
                .CountAsync();

            var history = await GetStatisticsHistory();

            return Ok(new
            {
                pending = pendingCount,
                added = addedCount,
                deleted = deletedCount,
                history = history
            });
        }

        private async Task<List<StatisticsHistoryItem>> GetStatisticsHistory()
        {
            var last30Days = Enumerable.Range(0, 30)
                .Select(i => DateTime.UtcNow.AddDays(-i).Date)
                .ToList();

            var history = new List<StatisticsHistoryItem>();

            foreach (var date in last30Days)
            {
                var added = await _context.MapObject
                    .Where(o => o.CreatedAt.Date == date)
                    .CountAsync();

                var deleted = await _context.PendingSocialMapObject
                    .Where(o => o.Status == "Rejected" && o.DateAdded.Date == date)
                    .CountAsync();

                var pending = await _context.PendingSocialMapObject
                    .Where(o => o.Status == "Pending" && o.DateAdded.Date == date)
                    .CountAsync();

                history.Add(new StatisticsHistoryItem
                {
                    Date = date.ToString("yyyy-MM-dd"),
                    Added = added,
                    Deleted = deleted,
                    Pending = pending
                });
            }

            return history;
        }
    }

    public class StatisticsHistoryItem
    {
        public string Date { get; set; }
        public int Added { get; set; }
        public int Deleted { get; set; }
        public int Pending { get; set; }
    }
} 