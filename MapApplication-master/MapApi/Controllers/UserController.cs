using MapApi.Context;
using MapApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MapApi.Controllers
{
    [Route("api/users")]
    [ApiController]
    public class UserController : Controller
    {
        private readonly ApplicationContext _context;

        public UserController(ApplicationContext context)
        {
            _context = context;
        }

        // Получение списка всех пользователей
        [HttpGet("GetUsers")]
        public async Task<ActionResult<IEnumerable<User>>> GetUsers()
        {
            if (_context.User == null)
            {
                return NotFound();
            }
            return await _context.User.ToListAsync();
        }

        // Добавление пользователя в систему
        [HttpPost("AddUser")]
        public async Task<IActionResult> AddUser([FromBody] RegisterUserRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Password))
                return BadRequest(new { message = "Пароль не может быть пустым." });

            if (_context.User.Any(u => u.Email == request.Email))
                return BadRequest(new { message = "Пользователь с таким email уже существует." });
            Console.WriteLine(request.Name);
            Console.WriteLine(request.Type);

            Console.WriteLine(request.Email);
            Console.WriteLine(request.Password);
            var user = new User
            {
                Name = request.Name,
                Type = request.Type,
                Email = request.Email,
                Password = request.Password,
                Score = 0

            };
            Console.WriteLine(user);
            _context.User.Add(user);
            _context.SaveChanges();

            return Ok(new { message = "Регистрация успешна!" });
        }


        // Извлечение пользователя по e-mail
        [HttpGet("GetUser/{email}")]
        public async Task<ActionResult<User>> GetUserByEmail(string email)
        {
            if (_context.User == null)
            {
                return Problem("Entity set 'MvcMovieContext.Movie'  is null.");
            }

            var users = from m in _context.User
                        select m;

            if (!String.IsNullOrEmpty(email))
            {
                users = users.Where(s => s.Email!.Contains(email));
            }
            return await users.FirstOrDefaultAsync();
        }



        [HttpPut("EditUser/{id}")]
        public async Task<IActionResult> EditUser(int id, [FromBody] UserUpdateDto updatedData)
        {
            if (_context.User == null)
            {
                return Problem("Entity set 'MvcMovieContext.User' is null.");
            }

            var user = await _context.User.FindAsync(id);
            Console.WriteLine(user.Name);
            if (user == null)
            {
                return NotFound($"User with ID {id} not found.");
            }

            // Обновляем Email
            user.Email = updatedData.Email;
            user.Type = updatedData.Category;
            user.Password = updatedData.Password;
            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!_context.User.Any(e => e.Id == id))
                {
                    return NotFound($"User with ID {id} no longer exists.");
                }
                else
                {
                    throw;
                }
            }

            return NoContent();
        }





        // Удаление пользователя по ID
        [HttpDelete("DeleteUser/{id}")]
        public async Task<ActionResult> Delete(int id)
        {
            var user = await _context.User.FindAsync(id);

            if (user == null)
            {
                return NotFound();
            }

            _context.User.Remove(user);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // Добавление пользователя по Id
        [HttpPut("{id}")]
        public async Task<ActionResult> Put(int id, User user)
        {
            if (id != user.Id)
            {
                return BadRequest();
            }

            _context.Entry(user).State = EntityState.Modified;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!UserExists(id))
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

        // Добавление объекта в избранное пользователя
        [HttpPost("AddFavorite")]
        public async Task<IActionResult> AddFavorite([FromForm] int userID, [FromForm] int mapObjectID)
        {
            var userExists = await _context.User.AnyAsync(u => u.Id == userID);
            var mapObjectExists = await _context.MapObject.AnyAsync(mo => mo.Id == mapObjectID);

            if (!userExists || !mapObjectExists)
            {
                return BadRequest("Некорректный ID пользователя или объекта карты.");
            }

            var favorite = new Favorite
            {
                UserID = userID,
                MapObjectID = mapObjectID
            };

            _context.Favorites.Add(favorite);
            await _context.SaveChangesAsync();

            return Ok("Элемент добавлен в избранное успешно.");
        }

        // Удаление объекта из избранного пользователя
        [HttpDelete("RemoveFavorite")]
        public async Task<IActionResult> RemoveFavorite([FromForm] int userID, [FromForm] int mapObjectID)
        {
            var favorite = await _context.Favorites
                .FirstOrDefaultAsync(f => f.UserID == userID && f.MapObjectID == mapObjectID);

            if (favorite == null)
            {
                return NotFound("Элемент не найден.");
            }

            _context.Favorites.Remove(favorite);
            await _context.SaveChangesAsync();

            return Ok("Элемент успешно удален из избранного.");
        }

        // Получение списка избранного конкретного пользователя
        [HttpGet("GetLikesByUserId/{userId}")]
        public async Task<ActionResult<IEnumerable<MapObject>>> GetLikesByUserId(int userId)
        {
            var mapObjects = await _context.Favorites
                .Where(r => r.UserID == userId)
                .Select(r => r.MapObject)
                .ToListAsync();

            if (mapObjects == null || !mapObjects.Any())
            {
                return NotFound();
            }
            return Ok(mapObjects);
        }

        // Авторизация
        [HttpPost("login")]
        public IActionResult Authenticate([FromBody] LoginRequest loginRequest)
        {
            if (string.IsNullOrEmpty(loginRequest.Email) || string.IsNullOrEmpty(loginRequest.Password))
            {
                return BadRequest(new { message = "Email и пароль обязательны." });
            }

            var user = _context.User.FirstOrDefault(u => u.Email == loginRequest.Email);

            if (user == null)
            {
                return BadRequest(new { message = "Email неверный." });
            }

            if (user.Password != loginRequest.Password)
            {
                return BadRequest(new { message = "Пароль неверный." });
            }

            HttpContext.Session.SetInt32("UserId", user.Id);

            return Ok(new { success = true, message = "Успешная аутентификация!", userId = user.Id });
        }

        // Осуществление выхода из системы
        [HttpGet("logout")]
        public IActionResult Logout()
        {
            HttpContext.Session.Clear(); 
            return Ok(new { message = "Вы вышли из системы!" });
        }

        // Проверка текущего пользователя
        [HttpGet("current-user")]
        public IActionResult GetCurrentUser()
        {
            var userId = HttpContext.Session.GetInt32("UserId");
            if (userId == null)
            {
                return Unauthorized(new { message = "Вы не авторизованы." });
            }

            var user = _context.User.Find(userId);
            if (user == null)
            {
                return NotFound(new { message = "Пользователь не найден." });
            }

            return Ok(user);
        }

        // Проверка на существование пользователя
        private bool UserExists(int id)
        {
            return (_context.User?.Any(e => e.Id == id)).GetValueOrDefault();
        }

    }
    public class LoginRequest
    {
        public string Email { get; set; }
        public string Password { get; set; }
    }

    public class UserUpdateDto
    {
        public string Email { get; set; }
        public int Category { get; set; }
        public string Password { get; set; }
    }
    public class RegisterUserRequest
    {
        public string Name { get; set; }
        public int Type { get; set; }
        public string Email { get; set; }
        public string Password { get; set; }
    }

}
