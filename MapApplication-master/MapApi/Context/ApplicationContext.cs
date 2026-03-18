using MapApi.Models;
using Microsoft.EntityFrameworkCore;

namespace MapApi.Context
{
    public class ApplicationContext : DbContext
    {
        public DbSet<User> User => Set<User>();
        public DbSet<MapObject> MapObject => Set<MapObject>();
        public DbSet<Comment> Comment => Set<Comment>();
        public DbSet<Models.Route> Route => Set<Models.Route>();
        public DbSet<Recommendation> Recommendation => Set<Recommendation>();
        public DbSet<AdminSetting> AdminSettings => Set<AdminSetting>();
        public DbSet<PendingSocialMapObject> PendingSocialMapObject => Set<PendingSocialMapObject>();
        public DbSet<Favorite> Favorites => Set<Favorite>();
        public DbSet<PendingObject> PendingObjects { get; set; }
        public DbSet<MapObject> MapObjects { get; set; }
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Настройка связи "Один ко многим" между User и Route
            modelBuilder.Entity<User>()
                .HasMany(u => u.ListRoutes)
                .WithOne()
                .OnDelete(DeleteBehavior.Cascade);

            // Настройка связи "Многие ко многим" между Route и MapObject через промежуточную таблицу
            modelBuilder.Entity<Models.Route>()
                .HasMany(r => r.ListObjects)
                .WithMany()
                .UsingEntity(j => j.ToTable("RouteMapObject"));

            // Настройка связи "Один ко многим" между Comment и User
            modelBuilder.Entity<Comment>()
                .HasOne(c => c.User)
                .WithMany()
                .HasForeignKey(c => c.UserId);

            // Настройка связи "Один ко многим" между Comment и MapObject
            modelBuilder.Entity<Comment>()
                .HasOne(c => c.MapObject)
                .WithMany() 
                .HasForeignKey(c => c.MapObjectId);

            // Настройка связи "Один ко многим" между User и Recommendation
            modelBuilder.Entity<Recommendation>()
                .HasKey(r => new { r.UserID, r.MapObjectID });

            // Настройка связи "Один ко многим" между User и Recommendation
            modelBuilder.Entity<User>()
                .HasMany(u => u.Recommendations)
                .WithOne(r => r.User)
                .HasForeignKey(r => r.UserID)
                .OnDelete(DeleteBehavior.Cascade);

            // Настройка связи "Один ко многим" между MapObject и Recommendation
            modelBuilder.Entity<MapObject>()
                .HasMany(m => m.Recommendation)
                .WithOne(r => r.MapObject)
                .HasForeignKey(r => r.MapObjectID)
                .OnDelete(DeleteBehavior.Cascade);

            // Настройка связи "Один ко многим" между User и Favorite
            modelBuilder.Entity<Favorite>()
                .HasKey(r => new { r.UserID, r.MapObjectID });

            // Настройка связи "Один ко многим" между User и Favorite
            modelBuilder.Entity<User>()
                .HasMany(u => u.Favorites)
                .WithOne(r => r.User)
                .HasForeignKey(r => r.UserID)
                .OnDelete(DeleteBehavior.Cascade);

            // Настройка связи "Один ко многим" между MapObject и Favorite
            modelBuilder.Entity<MapObject>()
                .HasMany(m => m.Favorites)
                .WithOne(r => r.MapObject)
                .HasForeignKey(r => r.MapObjectID)
                .OnDelete(DeleteBehavior.Cascade);

            // Настройка связи "Один ко многим" между User и PendingSocialMapObject
            modelBuilder.Entity<PendingSocialMapObject>()
                .HasOne(p => p.User)
                .WithMany(u => u.PendingSocialMapObjects)
                .HasForeignKey(p => p.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Добавляем поле Status в PendingSocialMapObject
            modelBuilder.Entity<PendingSocialMapObject>()
                .Property(p => p.Status)
                .HasDefaultValue("Pending");
        }

        public ApplicationContext(DbContextOptions<ApplicationContext> options)
            : base(options)
        {
            Database.EnsureCreated();   // Cоздание базы данных при первом обращении
        }
    }
}
