using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace MapApi.Models
{
    public class User
    {
        public User()
        {
        }

        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        [Column("Name")]
        [Required]
        public string Name { get; set; } = null!;

        [Column("Type")]
        [Required]
        //[JsonConverter(typeof(JsonStringEnumConverter))]
        public int Type { get; set; }

        [Column("Email")]
        [Required]
        public string Email { get; set; } = null!;

        [Column("Password")]
        [Required]
        public string Password { get; set; } = null!;

        [Column("Score")]
        [Required]
        public int Score { get; set; } = 0;

        public List<Route> ListRoutes { get; set; } = new List<Route>();  //Навигационное свойство для хранения коллекции списка маршрутов

        public ICollection<Recommendation> Recommendations { get; set; } = new List<Recommendation>();  //Навигационное свойство для хранения коллекции списка рекомендаций

        public ICollection<Favorite> Favorites { get; set; } = new List<Favorite>();

        public ICollection<PendingSocialMapObject> PendingSocialMapObjects { get; set; } = new List<PendingSocialMapObject>();

    }

    public enum UserStatus
    {
        Для_людей_с_нарушением_слуха,
        Для_инвалидов,_передвигающихся_на_коляске,
        Для_людей_с_нарушением_опорнодвигательного_аппарата,
        Для_людей_с_нарушением_зрения,
        Для_людей_с_нарушением_умственного_развития
    }

}
