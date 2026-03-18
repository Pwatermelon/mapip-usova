using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MapApi.Models
{
    public class Comment
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        [Column("Text")]
        public string? Text { get; set; } = null!;

        [Column("Rate")]
        [Required]
        public int Rate { get; set; }
        
        [Column("UserId")]
        [Required]
        public int UserId { get; set; }

        [Column("Date")]
        [Required]
        public DateTime Date { get; set; }

        [Column("MapObjectId")]
        [Required]
        public int MapObjectId { get; set; }
        
        public MapObject? MapObject { get; set; } = null!;
        public User? User { get; set; } = null!;
    }
}
