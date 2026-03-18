using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MapApi.Models
{
    public class PendingSocialMapObject
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        [Column("DisplayName")]
        [Required]
        public string DisplayName { get; set; }

        [Column("Address")]
        [Required]
        public string Address { get; set; }

        [Column("X")]
        public double? X { get; set; }

        [Column("Y")]
        public double? Y { get; set; }

        [Column("Type")]
        [Required]
        public string Type { get; set; }

        [Column("Description")]
        public string? Description { get; set; } = null;

        [Column("DisabilityCategory")]
        public string? DisabilityCategory { get; set; } = null;

        [Column("WorkingHours")]
        public string? WorkingHours { get; set; } = null;

        [Column("Images")]
        public string? Images { get; set; } = null;

        [Column("Accessibility")]
        public string? Accessibility { get; set; } = null;

        [Column("Excluded")]
        [Required]
        public bool Excluded { get; set; } = false;

        [Column("MapObject")]
        public int? MapObjectID { get; set; } = 0;

        [Column("DateAdded")]
        [Required]
        public DateTime DateAdded { get; set; } = DateTime.Now;

        [Column("Status")]
        [Required]
        public string Status { get; set; } = "Pending";

        [Column("IRI")]
        public string? IRI { get; set; } = null;

        [Column("Rating")]
        public double? Rating { get; set; } = null;

        [ForeignKey("User")]
        public int UserId { get; set; }

        public User User { get; set; } = null!;
    }
}
