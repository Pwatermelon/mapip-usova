using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MapApi.Models
{
    public class AdminSetting
    {
        [Key]
        public int Id { get; set; }

        [Column("RnValue")]
        public int Rate { get; set; }

        [Column("ExcludedCategories")]
        public string? ExcludedCategories { get; set; } = null!;

        [Column("CronExpression")]
        public string CronExpression { get; set; }

    }
}
