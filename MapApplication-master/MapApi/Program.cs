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
    ?? "Host=localhost;Port=5432;Username=postgres;Password=12345;Database=Map";
builder.Services.AddDbContext<ApplicationContext>(options =>
{
    options.UseNpgsql(connection);
});

// ��������� Quartz
builder.Services.AddQuartz(q =>
{
    q.UseMicrosoftDependencyInjectionJobFactory();

    var jobKey = new JobKey("IntersectedDataJob");
    q.AddJob<IntersectedDataJob>(opts => opts
        .WithIdentity(jobKey)
        .StoreDurably());

    // ���������� cron-��������� �� ���� ������
    string cronExpression = null;

    using (var dbConnection = new NpgsqlConnection(connection))
    {
        dbConnection.Open();
        using (var command = new NpgsqlCommand("SELECT \"CronExpression\" FROM public.\"AdminSettings\" LIMIT 1", dbConnection))
        {
            var result = command.ExecuteScalar();
            if (result != null)
            {
                cronExpression = result.ToString();
            }
        }
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

app.UseHttpsRedirection();
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(@"D:\MAPIP\MapApplication-master\clientapp"),
    RequestPath = "/clientapp"
});

app.UseSession(); // ����������� middleware ��� ������ � ��������
app.UseAuthorization();
app.MapControllers();

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
