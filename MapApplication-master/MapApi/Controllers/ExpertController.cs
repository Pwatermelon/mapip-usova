using Microsoft.AspNetCore.Mvc;
using MapApi.Models;
using MapApi.Context;
using Microsoft.EntityFrameworkCore;
using VDS.RDF;
using VDS.RDF.Parsing;
using VDS.RDF.Query;
using System.Web;
using System.Text;

namespace MapApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ExpertController : ControllerBase
    {
        private readonly ApplicationContext _context;

        public ExpertController(ApplicationContext context)
        {
            _context = context;
        }

        [HttpGet("pending")]
        public async Task<IActionResult> GetPendingObjects()
        {
            var pendingObjects = await _context.PendingSocialMapObject
                .Where(o => o.Status == "Pending")
                .ToListAsync();

            return Ok(pendingObjects);
        }

        [HttpPost("{id}/approve")]
        public async Task<IActionResult> ApproveObject(int id)
        {
            var pendingObject = await _context.PendingSocialMapObject.FindAsync(id);
            if (pendingObject == null)
                return NotFound();

            var mapObject = new MapObject
            {
                Display_name = pendingObject.DisplayName,
                X = pendingObject.X ?? 0.0,
                Y = pendingObject.Y ?? 0.0,
                Adress = pendingObject.Address,
                Type = pendingObject.Type,
                Description = pendingObject.Description,
                Images = pendingObject.Images,
                WorkingHours = pendingObject.WorkingHours,
                CreatedAt = DateTime.UtcNow
            };

            _context.MapObject.Add(mapObject);
            pendingObject.Status = "Approved";
            await _context.SaveChangesAsync();

            return Ok();
        }

        [HttpPost("{id}/reject")]
        public async Task<IActionResult> RejectObject(int id)
        {
            var pendingObject = await _context.PendingSocialMapObject.FindAsync(id);
            if (pendingObject == null)
                return NotFound();

            pendingObject.Status = "Rejected";
            await _context.SaveChangesAsync();

            return Ok();
        }

        [HttpPut("{id}/edit")]
        public async Task<IActionResult> EditPendingObject(int id, [FromBody] PendingSocialMapObject updateAt)
        {
            var obj = await _context.PendingSocialMapObject.FindAsync(id);
            if (obj == null) return NotFound();
            obj.DisplayName = updateAt.DisplayName;
            obj.Address = updateAt.Address;
            obj.Description = updateAt.Description;
            obj.DisabilityCategory = updateAt.DisabilityCategory;
            obj.WorkingHours = updateAt.WorkingHours;
            obj.Accessibility = updateAt.Accessibility;
            await _context.SaveChangesAsync();
            return Ok();
        }
    }
} 