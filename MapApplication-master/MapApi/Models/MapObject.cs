using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MapApi.Models
{
    public class MapObject
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        [Column("X")]
        [Required]
        public double X { get; set; }

        [Column("Y")]
        [Required]
        public double Y { get; set; }

        [Column("Display_name")]
        [Required]
        public string? Display_name { get; set; }

        [Column("IRI")]
        [Required]
        public string? IRI { get; set; }

        [Column("Adress")]
        [Required]
        public string Adress { get; set; } = "Адрес не указан";

        [Column("Description")]
        [Required]
        public string? Description { get; set; } = "Описание не указано";

        [Column("Images")]
        [Required]
        public string Images { get; set; } = "Нет изображения";

        [Column("Type")]
        [Required]
        public string Type { get; set; } = "Тип не указан";

        [Column("Rating")]
        public int? Rating { get; set; } = 0;

        [Column("WorkingHours")]
        [Required]
        public string? WorkingHours { get; set; } = "График работы не указан";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }

        public ICollection<Recommendation> Recommendation { get; set; } = new List<Recommendation>();
        public ICollection<Favorite> Favorites { get; set; } = new List<Favorite>();
    }
}
