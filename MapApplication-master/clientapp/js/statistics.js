let objectsChart;

document.addEventListener('DOMContentLoaded', function() {
    loadStatistics();
    initializeChart();
});

async function loadStatistics() {
    try {
        const response = await fetch('/api/statistics');
        const stats = await response.json();
        updateStatisticsDisplay(stats);
        updateChart(stats);
    } catch (error) {
        console.error('Ошибка при загрузке статистики:', error);
    }
}

function updateStatisticsDisplay(stats) {
    document.getElementById('pending-count').textContent = stats.pending;
    document.getElementById('added-count').textContent = stats.added;
    document.getElementById('deleted-count').textContent = stats.deleted;
}

function initializeChart() {
    const ctx = document.getElementById('objectsChart').getContext('2d');
    objectsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Добавленные объекты',
                    borderColor: '#28a745',
                    data: []
                },
                {
                    label: 'Удаленные объекты',
                    borderColor: '#dc3545',
                    data: []
                },
                {
                    label: 'Ожидающие модерации',
                    borderColor: '#007bff',
                    data: []
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function updateChart(stats) {
    const dates = (stats.history || []).map(item => item.date || item.Date);
    const addedData = (stats.history || []).map(item => item.added ?? item.Added ?? 0);
    const deletedData = (stats.history || []).map(item => item.deleted ?? item.Deleted ?? 0);
    const pendingData = (stats.history || []).map(item => item.pending ?? item.Pending ?? 0);

    objectsChart.data.labels = dates;
    objectsChart.data.datasets[0].data = addedData;
    objectsChart.data.datasets[1].data = deletedData;
    objectsChart.data.datasets[2].data = pendingData;
    objectsChart.update();
}

// Обновляем статистику каждые 5 минут
setInterval(loadStatistics, 300000); 