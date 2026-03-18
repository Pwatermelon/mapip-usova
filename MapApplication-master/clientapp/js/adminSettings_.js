const apiUrl = 'http://localhost:5000/api/admin';

let excludedCategories = [];

async function fetchSettings() {
    try {
        const response = await fetch(`${apiUrl}/GetSettings`);
        if (response.ok) {
            const settings = await response.json();
            document.getElementById('rnValue').value = settings.rnValue !== undefined ? settings.rnValue : 0;
            
            excludedCategories = settings.excludedCategories?.filter(category => category !== "$id") || [];
            console.log(excludedCategories);
            document.getElementById('cronExpression').value = settings.cronExpression; 
        } else {
            document.getElementById('message').textContent = 'Не удалось получить настройки.';
        }
    } catch (error) {
        console.error('Ошибка:', error);
        document.getElementById('message').textContent = 'Ошибка при получении настроек.';
    }
}

async function loadInfrastructureElements() {
    try {
        const response = await fetch(`${apiUrl}/get/infrastructure`);
        const data = await response.json();
        const container = document.getElementById('container');
        container.innerHTML = '';

        for (const [type, info] of Object.entries(data)) {
            
            if (type === "$id") continue; 

            const categories = info || [];
            console.log("dd");
            console.log(categories);
            const typeContainer = document.createElement('div');
            typeContainer.className = 'type-container';

            const typeHeader = document.createElement('div');
            typeHeader.className = 'type-header';

            const toggleIcon = document.createElement('span');
            toggleIcon.className = 'toggle-icon';
            toggleIcon.textContent = '➡️'; 

            const typeLabel = document.createElement('span');
            typeLabel.textContent = type;
            typeLabel.className = 'type-label';

            const categoryContainer = document.createElement('div');
            categoryContainer.className = 'category-container';
            categoryContainer.style.display = 'none'; 

            categories.forEach(category => {
                const categoryCheckbox = document.createElement('input');
                categoryCheckbox.type = 'checkbox';
                categoryCheckbox.className = 'category-checkbox';
                categoryCheckbox.id = `category-${category}`;
                categoryCheckbox.value = category;

                if (excludedCategories.includes(category)) {
                    categoryCheckbox.checked = true;
                }

                const categoryLabel = document.createElement('label');
                categoryLabel.htmlFor = `category-${category}`;
                categoryLabel.textContent = category;

                categoryContainer.appendChild(categoryCheckbox);
                categoryContainer.appendChild(categoryLabel);
                categoryContainer.appendChild(document.createElement('br'));
            });

            typeHeader.addEventListener('click', () => {
                const isHidden = categoryContainer.style.display === 'none';
                categoryContainer.style.display = isHidden ? 'block' : 'none';
                toggleIcon.textContent = isHidden ? '⬇️' : '➡️';
            });

            typeHeader.appendChild(toggleIcon);
            typeHeader.appendChild(typeLabel);
            typeContainer.appendChild(typeHeader);
            typeContainer.appendChild(categoryContainer);

            container.appendChild(typeContainer);
        }
    } catch (error) {
        console.error('Ошибка при загрузке данных:', error);
    }
}

// Получение настроек при загрузке страницы
window.onload = fetchSettings;

// Сохранение RnValue
async function saveRnValue() {
    const rnValue = document.getElementById('rnValue').value;

    try {
        const response = await fetch(`${apiUrl}/settings/UpdateRnValue`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ RnValue: parseInt(rnValue) }),
        });

        if (response.ok) {
            document.getElementById('message').textContent = 'Настройки успешно обновлены.';
        } else {
            document.getElementById('message').textContent = 'Ошибка при обновлении настроек.';
        }
    } catch (error) {
        console.error('Ошибка:', error);
        document.getElementById('message').textContent = 'Ошибка при сохранении настроек.';
    }
}

// Сохранение cron выражения
async function saveCronExpression() {
    const cronExpression = document.getElementById('cronExpression').value;

    try {
        const response = await fetch(`${apiUrl}/settings/UpdateCronExpression`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ CronExpression: cronExpression }),
        });

        if (response.ok) {
            document.getElementById('message').textContent = 'Настройки успешно обновлены.';
        } else {
            document.getElementById('message').textContent = 'Ошибка при обновлении настроек.';
        }
    } catch (error) {
        console.error('Ошибка:', error);
        document.getElementById('message').textContent = 'Ошибка при сохранении настроек.';
    }
}

// Сохранение исключенных категорий
async function saveExcludedCategories() {
    const selectedCategories = Array.from(document.querySelectorAll('.category-checkbox:checked')).map(checkbox => checkbox.value);

    try {
        const response = await fetch(`${apiUrl}/settings/UpdateExcludedCategories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ExcludedCategories: selectedCategories }),
        });

        if (response.ok) {
            document.getElementById('message').textContent = 'Настройки успешно обновлены.';
        } else {
            document.getElementById('message').textContent = 'Ошибка при обновлении настроек.';
        }
    } catch (error) {
        console.error('Ошибка:', error);
        document.getElementById('message').textContent = 'Ошибка при сохранении настроек.';
    }
}

function save() {
    saveRnValue();
    saveCronExpression();
    saveExcludedCategories();
}

// Обработчики событий для кнопок сохранения
document.getElementById('saveCategories').addEventListener('click', save);

// Получение настроек при загрузке страницы
window.onload = loadInfrastructureElements();
window.onload = fetchSettings();