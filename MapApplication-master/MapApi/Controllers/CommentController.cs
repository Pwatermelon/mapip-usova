using MapApi.Context;
using MapApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using Npgsql;
using System.Net.Http;

namespace MapApi.Controllers
{
    [Route("api/comment")]
    [ApiController]
    public class CommentController : Controller
    {
        private readonly ApplicationContext _context;
        private readonly HttpClient _httpClient;
        private readonly string _connectionString = "Host=localhost;Port=5432;Username=postgres;Password=12345;Database=map";

        public CommentController(ApplicationContext context, HttpClient httpClient)
        {
            _context = context;
            _httpClient = httpClient;
            _httpClient.Timeout = TimeSpan.FromSeconds(100000);
        }
        
        //Получение комментариев, добавленных за 5 последних дней
        [HttpGet("GetLastComments")]
        public async Task<ActionResult<IEnumerable<Comment>>> GetComments()
        {
            var fiveDaysAgo = DateTime.UtcNow.AddDays(-7);
            var comments = await _context.Comment
                                         .Include(c => c.User)
                                         .Include(c => c.MapObject)
                                         .Where(c => c.Date >= fiveDaysAgo)
                                         .ToListAsync();
            return comments;
        }

        // Добавление комментария
        /*[HttpPost("AddComment")]
        public async Task<IActionResult> AddComment([FromBody] Comment comment)
        {
            Console.WriteLine(comment.UserId);
            var response = await _httpClient.PostAsJsonAsync("http://localhost:5001/comments/replace_comment", new { comment = comment.Text });
            if (!response.IsSuccessStatusCode)
            {
                return StatusCode((int)response.StatusCode, new { message = "Ошибка при обработке комментария" });
            }

            var result = JsonConvert.DeserializeObject<ReplaceCommentResponse>(await response.Content.ReadAsStringAsync());

            if (result == null)
            {
                return StatusCode(500, new { message = "Ошибка при обработке комментария" });
            }

            if (result.WasModified)
            {
                return Ok(new
                {
                    isOffensive = true,
                    modifiedText = result.Message,
                    message = "Ваш комментарий содержит оскорбительные выражения. Заменить их?"
                });
            }

            var user = await _context.User.FindAsync(comment.UserId);
            if (user == null)
            {
                return BadRequest(new { message = "Пользователь не найден." });
            }

            var mapObject = await _context.MapObject.FindAsync(comment.MapObjectId);
            if (mapObject == null)
            {
                return BadRequest(new { message = "Объект карты не найден." });
            }

            comment.Text = result.Message;
            comment.Date = DateTime.UtcNow;
            _context.Comment.Add(comment);
            await _context.SaveChangesAsync();

            return Ok(new { isOffensive = false, message = "Комментарий добавлен успешно!" });
        }*/


        [HttpPost("AddComment")]
        public async Task<IActionResult> AddComment([FromBody] AddCommentDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.NewText))
            {
                return BadRequest(new { message = "Некорректные данные." });
            }

            var comment = new Comment
            {
                UserId = dto.User,  
                MapObjectId = dto.MapObject,
                Text = dto.NewText,
                Rate = dto.NewRate,
                Date = DateTime.UtcNow
            };

            _context.Comment.Add(comment);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Комментарий добавлен успешно!" });
        }



        // Поиск комментариев по ID объекта
        [HttpGet("GetCommentsByMapObject/{mapObjectId}")]
        public async Task<ActionResult<IEnumerable<Comment>>> GetCommentByMapObject(int mapObjectId)
        {
            if (_context.Comment == null)
            {
                return Problem("");
            }

            var mapObject = await _context.MapObject.FindAsync(mapObjectId);

            var comments = from m in _context.Comment select m;
            comments = comments.Include(c => c.User).Where(s => s.MapObject.Equals(mapObject));

            return await comments.ToListAsync();
        }

        [HttpGet("GetCommentsByMapObject")]
        public async Task<IActionResult> GetCommentByMapObject([FromQuery] int mapObjectId, [FromQuery] int userId)
        {
            if (_context.Comment == null)
            {
                return NotFound(new { message = "Comment context is null" });
            }

            var comment = await _context.Comment
                .Include(c => c.User)
                .Where(c => c.MapObjectId == mapObjectId && c.UserId == userId)
                .FirstOrDefaultAsync(); // Берем только один комментарий

            if (comment == null)
            {
                return NotFound(new { message = "No comments found" });
            }

            return Ok(comment);
        }





        // Удаление комментария по ID
        [HttpDelete("DeleteComment/{id}")]
        public async Task<IActionResult> DeleteComment(int id)
        {
            var comment = await _context.Comment.FindAsync(id);
            if (comment == null)
            {
                return NotFound();
            }

            _context.Comment.Remove(comment);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // Редактирование комментария по ID
        [HttpPut("EditComment/{id}")]
        public async Task<IActionResult> EditComment(int id, [FromBody] EditCommentDto commentDto)
        {
            var comment = await _context.Comment.FindAsync(id);
            if (comment == null)
            {
                return NotFound();
            }

            comment.Text = commentDto.NewText;
            comment.Rate = commentDto.NewRate;
            _context.Comment.Update(comment);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // Поиск оскорбительных комментариев
        [HttpGet("GetOffensiveComments")]
        public async Task<ActionResult<IEnumerable<Comment>>> GetOffensiveComments()
        {
            var result = new List<Comment>();

            using (var connection = new NpgsqlConnection(_connectionString))
            {
                await connection.OpenAsync();

                using (var command = new NpgsqlCommand(@"SELECT ""Id"", ""Text"", ""Rate"", ""UserId"", ""MapObjectId"" FROM public.""Comment"";", connection))
                {
                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            result.Add(new Comment
                            {
                                Id = reader.GetInt32(reader.GetOrdinal("Id")),
                                Text = reader.GetString(reader.GetOrdinal("Text")),
                                Rate = reader.GetInt32(reader.GetOrdinal("Rate")),
                                User = await _context.User.FindAsync(reader.GetOrdinal("UserId")),
                                MapObject = await _context.MapObject.FindAsync(reader.GetOrdinal("MapObjectId"))
                            });
                        }
                    }
                }
            }

            var response = await _httpClient.PostAsJsonAsync("http://localhost:5001/comments/check_comments", result);

            if (response.IsSuccessStatusCode)
            {
                var offensiveCommentsJson = await response.Content.ReadAsStringAsync();

                var offensiveComments = JsonConvert.DeserializeObject<List<Comment>>(offensiveCommentsJson);

                offensiveComments.Select(comment => new
                {
                    comment.Id,
                    comment.Text,
                    comment.Rate,
                    comment.UserId,
                    comment.MapObjectId
                }).ToList();
                return Ok(offensiveComments);
            }

            return BadRequest("Error fetching offensive comments");
        }
    }

    public class EditCommentDto
    {
        public string NewText { get; set; }
        public int NewRate { get; set; }
    }
    public class AddCommentDto
    {
        public int User { get; set; }
        public int MapObject { get; set; }
        public string NewText { get; set; }
        public int NewRate { get; set; }
    }
public class ReplaceCommentResponse
    {
        public string Message { get; set; }
        public bool WasModified { get; set; }
    }
}
