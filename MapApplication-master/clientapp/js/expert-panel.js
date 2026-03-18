let map;
let markers = [];

// Глобальная переменная для хранения объектов
window.lastPendingObjects = [];

document.addEventListener('DOMContentLoaded', function() {
    loadPendingObjects();
    updateStatistics();
});

function initializeMap() {
    map = L.map('map').setView([55.7558, 37.6173], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

async function loadPendingObjects() {
    try {
        const response = await fetch('/api/expert/pending');
        if (!response.ok) {
            throw new Error('Ошибка HTTP: ' + response.status);
        }
        const objects = await response.json();
        displayPendingObjects(objects);
    } catch (error) {
        console.error('Ошибка при загрузке объектов:', error);
        const container = document.getElementById('pending-objects');
        if (container) {
            container.innerHTML = '<div style="color:red;">Ошибка загрузки объектов: ' + error.message + '</div>';
        }
    }
}

function displayPendingObjects(objects) {
    window.lastPendingObjects = objects || [];
    const container = document.getElementById('pending-objects');
    container.innerHTML = '';
    if (!objects || objects.length === 0) {
        container.innerHTML = '<div style="color:#888; font-size:1.1rem;">Нет объектов на модерацию</div>';
        return;
    }
    objects.forEach(object => {
        const objectElement = createObjectElement(object);
        container.appendChild(objectElement);
    });
}

function createObjectElement(object) {
    const div = document.createElement('div');
    div.className = 'pending-object';
    div.setAttribute('data-object-id', object.id);
    div.innerHTML = `
        <div class="card" style="background:#fff; border-radius:12px; box-shadow:0 2px 8px #b8dafd; padding:20px 24px; margin-bottom:18px;">
            <h3 style="margin:0 0 10px 0; color:#1e90ff; font-size:1.2rem;">${object.displayName || 'Без названия'}</h3>
            <div style="margin-bottom:8px; color:#333;"><b>Тип:</b> ${object.type || '—'}</div>
            <div style="margin-bottom:8px; color:#333;"><b>Адрес:</b> ${object.address || '—'}</div>
            <div style="margin-bottom:8px; color:#333;"><b>Описание:</b> ${object.description || '—'}</div>
            <div style="margin-bottom:8px; color:#333;"><b>Категория доступности:</b> ${object.disabilityCategory || '—'}</div>
            <div style="margin-bottom:8px; color:#333;"><b>Время работы:</b> ${object.workingHours || '—'}</div>
            <div style="margin-bottom:8px; color:#333;"><b>Особенности доступности:</b> ${object.accessibility || '—'}</div>
            <div class="actions" style="display:flex; gap:12px; margin-top:18px;">
                <button class="approve" style="background:#17b52e; color:#fff; border:none; border-radius:6px; padding:8px 18px; font-size:1rem; font-weight:500; cursor:pointer; transition:background 0.2s;" onclick="approveObject(${object.id})">Одобрить</button>
                <button class="reject" style="background:#dc3545; color:#fff; border:none; border-radius:6px; padding:8px 18px; font-size:1rem; font-weight:500; cursor:pointer; transition:background 0.2s;" onclick="rejectObject(${object.id})">Отклонить</button>
                <button class="edit" style="background:#1e90ff; color:#fff; border:none; border-radius:6px; padding:8px 18px; font-size:1rem; font-weight:500; cursor:pointer; transition:background 0.2s;" onclick="openEditModal(${object.id})">Редактировать</button>
            </div>
        </div>
    `;
    return div;
}

function addMarkerToMap(object) {
    if (object.x && object.y) {
        const marker = L.marker([object.x, object.y])
            .bindPopup(`
                <strong>${object.displayName}</strong><br>
                ${object.description}<br>
                Тип: ${object.type}
            `);
        marker.addTo(map);
        markers.push(marker);
    }
}

async function approveObject(objectId) {
    try {
        const response = await fetch('/api/expert/' + objectId + '/approve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (response.ok) {
            removeObjectFromList(objectId);
            updateStatistics();
        } else {
            alert('Ошибка при одобрении объекта');
        }
    } catch (error) {
        console.error('Ошибка при одобрении объекта:', error);
        alert('Ошибка при одобрении объекта');
    }
}

async function rejectObject(objectId) {
    try {
        const response = await fetch('/api/expert/' + objectId + '/reject', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (response.ok) {
            removeObjectFromList(objectId);
            updateStatistics();
        } else {
            alert('Ошибка при отклонении объекта');
        }
    } catch (error) {
        console.error('Ошибка при отклонении объекта:', error);
        alert('Ошибка при отклонении объекта');
    }
}

function removeObjectFromList(objectId) {
    const objectElement = document.querySelector(`[data-object-id="${objectId}"]`);
    if (objectElement) {
        objectElement.remove();
    }
}

async function updateStatistics() {
    try {
        const response = await fetch('/api/statistics');
        if (!response.ok) return;
        const stats = await response.json();
        document.getElementById('pending-count').textContent = stats.pending;
        document.getElementById('added-count').textContent = stats.added;
        document.getElementById('deleted-count').textContent = stats.deleted;
    } catch (error) {
        console.error('Ошибка при обновлении статистики:', error);
    }
}

function openEditModal(id) {
    if (!window.lastPendingObjects) window.lastPendingObjects = [];
    const object = window.lastPendingObjects.find(o => o.id === id);
    if (!object) {
        alert('Объект не найден!');
        return;
    }
    // Сохраняем полный объект для редактирования
    window.currentEditingObject = object;

    document.getElementById('editId').value = object.id;
    document.getElementById('editName').value = object.displayName || '';
    document.getElementById('editAddress').value = object.address || '';
    document.getElementById('editDescription').removeAttribute('readonly');
    document.getElementById('editDescription').removeAttribute('disabled');
    document.getElementById('editDescription').value = object.description || '';
    document.getElementById('editDisabilityCategory').value = object.disabilityCategory || '';
    document.getElementById('editWorkingHours').value = object.workingHours || '';
    document.getElementById('editAccessibility').value = object.accessibility || '';
    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

document.getElementById('editForm').onsubmit = async function(e) {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    
    // Берем полный объект, сохраненный при открытии модального окна
    const objectToSave = window.currentEditingObject;
    
    if (!objectToSave) {
        alert('Ошибка: объект для сохранения не найден.');
        return;
    }

    // Обновляем поля объекта значениями из формы
    objectToSave.displayName = document.getElementById('editName').value;
    objectToSave.address = document.getElementById('editAddress').value;
    objectToSave.description = document.getElementById('editDescription').value;
    objectToSave.disabilityCategory = document.getElementById('editDisabilityCategory').value;
    objectToSave.workingHours = document.getElementById('editWorkingHours').value;
    objectToSave.accessibility = document.getElementById('editAccessibility').value;
    
    // Добавляем/обновляем поле 'updated'
    objectToSave.updated = new Date().toISOString();

    // Проверяем наличие поля 'user' и добавляем его, если отсутствует
    if (!objectToSave.user) {
        objectToSave.user = {
            id: objectToSave.userId || 0, // Используем userId эксперта или 0 как fallback
            // Добавляем обязательные поля пользователя с дефолтными значениями
            name: "Anna",
            type: 0,
            email: "a@test", // Используем placeholder email
            password: "1111", // Используем placeholder пароль
            score: 0,
            listRoutes: [],
            recommendations: [],
            favorites: [],
            pendingSocialMapObjects: []
        };
    } else {
        // Если объект user уже существует, убедимся, что обязательные поля не null и их дочерние списки не null
        objectToSave.user.name = objectToSave.user.name || "placeholder";
        objectToSave.user.type = objectToSave.user.type || 0;
        objectToSave.user.email = objectToSave.user.email || "placeholder@example.com"; // Используем placeholder email
        objectToSave.user.password = objectToSave.user.password || "placeholder"; // Используем placeholder пароль
        objectToSave.user.score = objectToSave.user.score || 0;

        // Убедимся, что списки инициализированы
        objectToSave.user.listRoutes = objectToSave.user.listRoutes || [];
        objectToSave.user.recommendations = objectToSave.user.recommendations || [];
        objectToSave.user.favorites = objectToSave.user.favorites || [];
        objectToSave.user.pendingSocialMapObjects = objectToSave.user.pendingSocialMapObjects || [];

        // Дополнительно проверим вложенные списки внутри listRoutes[0].listObjects[0]
        if (objectToSave.user.listRoutes.length > 0 && objectToSave.user.listRoutes[0].listObjects && objectToSave.user.listRoutes[0].listObjects.length > 0) {
             const firstObject = objectToSave.user.listRoutes[0].listObjects[0];
             firstObject.recommendation = firstObject.recommendation || [];
             firstObject.favorites = firstObject.favorites || [];
        }

    }

    console.log("Отправляемый JSON:", JSON.stringify(objectToSave, null, 2)); // Выводим отправляемый JSON в консоль

    try {
        const response = await fetch('/api/expert/' + id + '/edit', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            // Отправляем полный обновленный объект
            body: JSON.stringify(objectToSave)
        });
        if (response.ok) {
            closeEditModal();
            loadPendingObjects();
            // Очищаем сохраненный объект после успешного сохранения
            window.currentEditingObject = null;
        } else {
            // Попробуем прочитать тело ответа для более детальной ошибки
            const errorText = await response.text();
            console.error('Ошибка при сохранении изменений:', response.status, errorText);
            alert('Ошибка при сохранении изменений: ' + response.status + ' ' + errorText);
        }
    } catch (err) {
        console.error('Ошибка при сохранении изменений:', err);
        alert('Ошибка при сохранении изменений');
    }
}; 