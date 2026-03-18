using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MapApi.Models
{
    public class Route
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        [Column("Date")]
        [Required]
        public string Date { get; set; } = null!;

        [Column("UserId")]
        [Required]
        public int UserId { get; set; }

        public List<MapObject> ListObjects { get; set; } = new List<MapObject>(); 
    }
}
