using MapApi.Context;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Npgsql;
using MapApi.Controllers;
using Quartz;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpClient();

var connection = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Host=db;Port=5432;Username=postgres;Password=12345;Database=map";
builder.Services.AddDbContext<ApplicationContext>(options =>
{
    options.UseNpgsql(connection);
});

// Создаём таблицы при первом запуске, настройки по умолчанию и тестовые объекты (если БД пустая)
using (var scope = builder.Services.BuildServiceProvider().CreateScope())
{
    var ctx = scope.ServiceProvider.GetRequiredService<ApplicationContext>();
    ctx.Database.EnsureCreated();
    if (!ctx.AdminSettings.Any())
    {
        ctx.AdminSettings.Add(new MapApi.Models.AdminSetting { CronExpression = "0 */5 * * * ?" });
        ctx.SaveChanges();
    }
    // Тестовые объекты на карте (Саратов), чтобы не было пусто при первом запуске
    if (!ctx.MapObject.Any())
    {
        var testObjects = new[]
        {
            new MapApi.Models.MapObject { X = 51.533557, Y = 46.034257, Display_name = "Тестовый объект 1", IRI = "http://example.org/seed#obj1", Adress = "ул. Московская, 1", Description = "Тестовое описание", Images = "Нет изображения", Type = "Социальная инфраструктура", Rating = 0, WorkingHours = "Пн–Пт 9:00–18:00" },
            new MapApi.Models.MapObject { X = 51.538, Y = 46.028, Display_name = "Тестовый объект 2", IRI = "http://example.org/seed#obj2", Adress = "ул. Волжская, 10", Description = "Тестовое описание", Images = "Нет изображения", Type = "Социальная инфраструктура", Rating = 0, WorkingHours = "Ежедневно 8:00–20:00" },
            new MapApi.Models.MapObject { X = 51.528, Y = 46.042, Display_name = "Тестовый объект 3", IRI = "http://example.org/seed#obj3", Adress = "пр. Кирова, 5", Description = "Тестовое описание", Images = "Нет изображения", Type = "Транспортная инфраструктура", Rating = 0, WorkingHours = "Круглосуточно" },
        };
        ctx.MapObject.AddRange(testObjects);
        ctx.SaveChanges();
    }
}

// Настройка Quartz
builder.Services.AddQuartz(q =>
{
    q.UseMicrosoftDependencyInjectionJobFactory();

    var jobKey = new JobKey("IntersectedDataJob");
    q.AddJob<IntersectedDataJob>(opts => opts
        .WithIdentity(jobKey)
        .StoreDurably());

    // Читаем cron-выражение из БД (если таблица ещё не создана — используем значение по умолчанию)
    string cronExpression = null;
    try
    {
        using (var dbConnection = new NpgsqlConnection(connection))
        {
            dbConnection.Open();
            using (var command = new NpgsqlCommand("SELECT \"CronExpression\" FROM public.\"AdminSettings\" LIMIT 1", dbConnection))
            {
                var result = command.ExecuteScalar();
                if (result != null)
                    cronExpression = result.ToString();
            }
        }
    }
    catch
    {
        // Таблицы ещё нет (EnsureCreated не вызывался) — будет использовано значение по умолчанию ниже
    }

    // �������� �������� � ����������� cron-����������
    if (!string.IsNullOrEmpty(cronExpression) && IsValidCronExpression(cronExpression))
    {
        q.AddTrigger(opts => opts
            .ForJob(jobKey)
            .WithIdentity("IntersectedDataJob-trigger")
            .WithCronSchedule(cronExpression));
    }
    else
    {
        // ���� cronExpression ������ ��� ������������, ���������� �������� �� ���������
        cronExpression = "0 */5 * * * ?";
        q.AddTrigger(opts => opts
            .ForJob(jobKey)
            .WithIdentity("IntersectedDataJob-trigger")
            .WithCronSchedule(cronExpression));
    }
});

// ���������� Quartz
builder.Services.AddQuartzHostedService(q => q.WaitForJobsToComplete = true);

// ����������� ������������
builder.Services.AddScoped<RecommendationController>();
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ���������� �������� ��� ������
builder.Services.AddDistributedMemoryCache(); // ��� �������� ������ � ������
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(30); 
    options.Cookie.HttpOnly = true; 
    options.Cookie.IsEssential = true;
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// В Docker слушаем только HTTP (80), HTTPS не настроен — редирект отключаем
if (app.Environment.IsDevelopment())
    app.UseHttpsRedirection();

var clientappPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "clientapp"));
if (Directory.Exists(clientappPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(clientappPath),
        RequestPath = "/clientapp"
    });
}

app.UseSession();
app.UseAuthorization();
app.MapControllers();

// Редирект с корня на главную страницу приложения
app.MapGet("/", () => Results.Redirect("/clientapp/map.html", false));
app.MapGet("/clientapp", () => Results.Redirect("/clientapp/map.html", false));
app.MapGet("/clientapp/", () => Results.Redirect("/clientapp/map.html", false));

app.Run();

// ����� �������� ���������� cron-���������
bool IsValidCronExpression(string cronExpression)
{
    try
    {
        CronExpression expression = new CronExpression(cronExpression);
        return true;
    }
    catch (Exception ex)
    {
        return false;
    }
}
