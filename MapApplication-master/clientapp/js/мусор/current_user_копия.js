let userId = undefined;

async function getCurrentUser() {
    try {
        const response = await fetch('http://localhost:5000/api/users/current-user', {
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
        const scoreContainer = document.getElementById('score-container');
        const score = document.getElementById('score-value');
        const categoryContainer = document.getElementById('categoriesButton');
        if (userData && userData.score !== undefined) {
            score.innerHTML = userData.score;
            scoreContainer.style.display = 'block'; // Убедитесь, что блок виден
            if (userData.score >= 100){
                categoryContainer.style.display = 'block';
            }
        }

        return userData; 
    } catch (error) {
        console.error('Ошибка при получении пользователя:', error.message);
        const scoreContainer = document.getElementById('score-container');
        const score = document.getElementById('score-value');
        scoreContainer.style.display = 'none'; 
        return null;
    }
}

async function initialize() {
    const user = await getCurrentUser();
    if (user) {
        console.log(`Имя пользователя: ${user.name}`);
        userId = user.id;
    }

    const button = document.getElementById('logoutButton');
    if (typeof userId === 'undefined' || userId === null) {
        button.textContent = 'Войти';
    } else {
        button.textContent = 'Выйти';
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
            window.location.replace('http://localhost:5000/clientapp/authorization.html');
        };

        buttons.appendChild(registerButton);
        block.appendChild(buttons);
    }
}

initialize();

document.getElementById('logoutButton').addEventListener('click', async (e) => {
    e.preventDefault(); 
    if (typeof userId === 'undefined' || userId === null) {
        window.location.href = 'http://localhost:5000/clientapp/authorization.html';
        return; 
    }
    
    try {
        const response = await fetch('http://localhost:5000/api/users/logout', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (response.ok) {
            const result = await response.json();
            window.location.href = 'http://localhost:5000/clientapp/authorization.html'; 
        } else {
            alert('Ошибка при выходе из системы.');
        }
    } catch (error) {
        console.error('Ошибка при запросе logout:', error.message);
        alert('Не удалось выполнить выход. Попробуйте позже.');
    }
});
