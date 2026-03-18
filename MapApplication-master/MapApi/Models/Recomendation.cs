using System.ComponentModel.DataAnnotations.Schema;

namespace MapApi.Models
{
    public class Recommendation
    {
        [ForeignKey("User")]
        public int UserID { get; set; }

        [ForeignKey("MapObject")]
        public int MapObjectID { get; set; }

        public User User { get; set; } = null!;  //Навигационное свойство для хранения коллекции списка пользователей 
        public MapObject MapObject { get; set; } = null!;  //Навигационное свойство для хранения коллекции списка объектов

    }
}
