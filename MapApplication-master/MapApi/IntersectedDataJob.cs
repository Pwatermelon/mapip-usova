using MapApi.Controllers;
using Quartz;

public class IntersectedDataJob : IJob
{
    private readonly IServiceProvider _serviceProvider;

    public IntersectedDataJob(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        using (var scope = _serviceProvider.CreateScope())
        {
            Console.WriteLine("IntersectedDataJob executed at: " + DateTime.Now);
            var recommendationController = scope.ServiceProvider.GetRequiredService<RecommendationController>();
            await recommendationController.PutIntersectedData();
        }
    }
}
