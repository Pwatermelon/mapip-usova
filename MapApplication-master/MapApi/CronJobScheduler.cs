using MapApi.Context;
using Microsoft.EntityFrameworkCore;
using Quartz;

public class CronJobScheduler
{
    private readonly ISchedulerFactory _schedulerFactory;
    private readonly IServiceProvider _serviceProvider;

    public CronJobScheduler(ISchedulerFactory schedulerFactory, IServiceProvider serviceProvider)
    {
        _schedulerFactory = schedulerFactory;
        _serviceProvider = serviceProvider;
    }

    public async Task StartAsync()
    {
        var scheduler = await _schedulerFactory.GetScheduler();

        string cronExpression = await GetCronExpressionFromDatabase();

        // Создание задания
        var job = JobBuilder.Create<IntersectedDataJob>()
            .WithIdentity("IntersectedDataJob")
            .Build();

        // Создание триггера
        var trigger = TriggerBuilder.Create()
            .WithIdentity("IntersectedDataJobTrigger")
            .WithCronSchedule(cronExpression)
            .Build();

        await scheduler.ScheduleJob(job, trigger);
        await scheduler.Start();
    }

    private async Task<string> GetCronExpressionFromDatabase()
    {
        using (var scope = _serviceProvider.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ApplicationContext>();
            var cronExpression = await context.AdminSettings
                .Select(settings => settings.CronExpression)
                .FirstOrDefaultAsync();
            return cronExpression ?? "* * * * *"; // Возвращаем каждую минуту по умолчанию
        }
    }
}
