const apiUrl = 'http://localhost:5000/api/comment';
const container = document.getElementById('user-container');
container.innerHTML = "<p class = 'messageCom'>Здесь будут отображены Данные Пользователя...</p>";

// Загрузка данных Пользователя по e-mail
function fetchUser(email) {
    const container = document.getElementById('user-container');
    const loadingSpinner = document.getElementById('loading-spinner');

    loadingSpinner.style.display = 'flex';
    axios.get(`http://localhost:5000/api/users/GetUser/${email}`)
        .then(response => {
            const user = response.data;
            
            loadingSpinner.style.display = 'none';
            
            if (user.name) {
                container.innerHTML = `
                <div class="comment">
                    <div class="comment-header">
                        <p class="comment-user"><strong>${user.name}</strong></p>
                    </div>
                    
                    <div class="form-item">
                    <label for="email">Email:</label>
                    <input type="text" id="text-${user.id}" value="${user.email}">
                    </div>
                    <div class="form-item">
                    <label for="type">Категория инвалидности:</label>
                    <select id="category-${user.id}">
                        <option value="0">Для людей с нарушением слуха</option>
                        <option value="1">Для инвалидов, передвигающихся на коляске</option>
                        <option value="2">Для людей с нарушением опорно-двигательного аппарата</option>
                        <option value="3">Для людей с нарушением зрения</option>
                        <option value="4">Для людей с нарушением умственного развития</option>
                    </select>
                    <label for="password">Пароль:</label>
                    <input type="password" id="password-${user.id}" value="${user.password}">
                    </div>
                    <div class="buttons">
                        <button onclick="saveData(${user.id})">Сохранить</button>
                        <button data-id="${user.id}" data-email="${user.email}" class="delete-button">Удалить</button>
                    </div>
                </div>
                `;

                const selectElement = document.getElementById(`category-${user.id}`);
                if (selectElement) {
                    selectElement.selectedIndex = user.type;
                }
            } else {
                container.innerHTML = "<p class='messageCom'>Пользователя с таким e-mail нет...</p>";
                return;
            }
        })
        .catch(error => {
            container.innerHTML = "<p class='messageCom'>Ошибка при загрузке данных...</p>";
            console.error(error);
            loadingSpinner.style.display = 'none';
        });
}

// Изменение данных пользователя
function saveData(id) {
    const email = document.getElementById(`text-${id}`).value;
    const category = parseInt(document.getElementById(`category-${id}`).value, 10);
    const password = document.getElementById(`password-${id}`).value;
    if (email && !isNaN(category)) {
        axios.put(`http://localhost:5000/api/users/EditUser/${id}`, { 
            email: email, 
            category: category,
            password: password 
        })
        .then(() => {
            alert('Данные успешно сохранены');
            fetchUser(email);
        })
        .catch(error => {
            console.error(error);
            alert('Ошибка при сохранении данных');
        });
    } else {
        alert('Пожалуйста, заполните все поля.');
    }
}

// Удаление Пользовтаеля из базы
function deleteUser(id, mail) {
    if (confirm('Вы уверены, что хотите удалить Пользователя?')) {
        axios.delete(`/api/users/DeleteUser/${id}`)
            .then(() => fetchUser(mail))
            .catch(error => console.error(error));
    }
}

// Событие на кнопку "Найти"
document.getElementById('search-inner-button').addEventListener('click', () => {
    const container = document.getElementById('user-container');
    container.innerHTML = '';
    const searchValue = document.getElementById('search-inner').value;
        if (searchValue.trim() !== '') {
            fetchUser(searchValue);
        } 
        else {
            alert('Введите значение для поиска!');
        }
});

// Событие на кнопку "Удалить"
document.addEventListener('click', (event) => {
    if (event.target.classList.contains('delete-button')) {
        const userId = event.target.getAttribute('data-id');
        const userEmail = event.target.getAttribute('data-email');
        deleteUser(userId, userEmail);
    }
});

