let userId = null;
let permission = false;
let accessibilityEnabled = false;

// Функция для слабовидящих
function toggleAccessibility() {
    const elements = document.querySelectorAll('body *');
    const button = document.getElementById('accessibilityButton');

    if (!accessibilityEnabled) {
        elements.forEach(element => {
            if (element.id === 'map' || element.classList.contains('map-container')) {
                return;
            }

            if (!element.hasAttribute('data-font-increased')) {
                const currentSize = window.getComputedStyle(element).fontSize;
                const newSize = parseFloat(currentSize) + 1; 
                element.style.fontSize = `${newSize}px`;

                element.setAttribute('data-font-increased', 'true');
            }

            element.style.fontWeight = 'bold';
        });

        button.style.fontSize = '20px';
        button.style.color = '#FFFFFF';
        button.style.backgroundColor = '#333333';
        button.style.fontWeight = 'bold';
        button.style.textShadow = '1px 1px 3px rgba(0, 0, 0, 0.2)';
        button.textContent = 'Отключить улучшение';
    } else {
        elements.forEach(element => {
            if (element.id === 'map' || element.classList.contains('map-container')) {
                return;
            }

            if (element.hasAttribute('data-font-increased')) {
                element.style.fontSize = '';
                element.removeAttribute('data-font-increased');
            }

            element.style.color = '';
            element.style.backgroundColor = '';
            element.style.fontWeight = '';
            element.style.textShadow = '';
        });

        button.style.fontSize = '';
        button.style.color = '';
        button.style.backgroundColor = '';
        button.style.fontWeight = '';
        button.style.textShadow = '';
        button.textContent = 'Версия для слабовидящих';
    }

    accessibilityEnabled = !accessibilityEnabled;
}

// Обработчик события для кнопки "Для слабовидящих"
document.getElementById('accessibilityButton').addEventListener('click', toggleAccessibility);

// Функция для определения текущего пользователя
async function getCurrentUser() {
    try {
        const response = await fetch('/api/users/current-user', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Не удалось получить данные текущего пользователя.');
        }

        const userData = await response.json();
        console.log('Текущий пользователь:', userData);

        return userData;
    } catch (error) {
        console.error('Ошибка при получении пользователя:', error.message);
        return null;
    }
}

// Загрузка страницы
async function initialize() {
    const user = await getCurrentUser();

    const logoutButton = document.getElementById('logoutButton');
    const block = document.getElementById('addObjectForm');
    const scoreContainer = document.getElementById('score-container');
    const score = document.getElementById('score-value');

    if (user) {
        userId = user.id;
        logoutButton.textContent = 'Выйти';
        permission = user.score >= 100;

        if (scoreContainer && score) {
            score.innerHTML = user.score;
            scoreContainer.style.display = 'block';
        }

        const block = document.getElementById('addObjectForm');
        if (typeof userId === 'undefined' || userId === null) {
            block.innerHTML = '';
            block.innerHTML = '<p>Доступно только для зарегистрированных пользователей!</p>';
            const buttons = document.createElement('div');
            buttons.classList.add('buttons');
    
            const registerButton = document.createElement('button');
            registerButton.textContent = 'Войти';
            registerButton.onclick = function(e) {
                e.preventDefault(); 
                window.location.replace('/clientapp/authorization.html');
            };
    
            buttons.appendChild(registerButton);
            block.appendChild(buttons);
        }
    } else {
        userId = null;
        logoutButton.textContent = 'Войти';

        if (scoreContainer) {
            scoreContainer.style.display = 'none';
        }

        if (block) {
            block.innerHTML = `
                <p>Доступно только для зарегистрированных пользователей!</p>
                <div class="buttons">
                    <button onclick="window.location.replace('/clientapp/authorization.html')">Войти</button>
                </div>
            `;
        }
    }
}

// Событие на кнопку "Выйти/Войти"
document.getElementById('logoutButton').addEventListener('click', async (e) => {
    e.preventDefault();

    if (!userId) {
        window.location.href = '/clientapp/authorization.html';
        return;
    }

    try {
        const response = await fetch('/api/users/logout', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (response.ok) {
            console.log('Пользователь вышел.');
            window.location.href = '/clientapp/authorization.html';
        } else {
            alert('Ошибка при выходе из системы.');
        }
    } catch (error) {
        console.error('Ошибка при выходе:', error.message);
        alert('Не удалось выполнить выход. Попробуйте позже.');
    }
});

// Инициализация при загрузке страницы
initialize();
