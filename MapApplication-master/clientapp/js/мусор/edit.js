$(document).ready(function() {
    $('#type').on('change', function() {
        const selectedType = $(this).val();

        if (selectedType === "Социальная инфраструктура") {
            $('#socialInfrastructureFields').show();
            
        } else {
            $('#socialInfrastructureFields').hide();
        }
    });

    fetch('/api/SocialMapObject/get/accessibility')
        .then(response => response.json())
        .then(data => {
            const items = Array.isArray(data) ? data : data;
            if (Array.isArray(items)) {
                const container = $('#accessibilityContainer');
                items.forEach(item => {
                    const checkbox = $('<input>').attr('type', 'checkbox').attr('name', 'accessibility').attr('value', item);
                    const label = $('<label>').text(item).prepend(checkbox);
                    
                    container.append(label);
                    container.append(document.createElement('br'));
                });
            }
        })
        .catch(error => console.error("Ошибка при загрузке элементов доступной среды:", error));
});

function submitForm() {
    const formData = new FormData();
    const categoryRadios = document.querySelectorAll('input[type="radio"]:checked');

    const form = document.getElementById('addObjectForm');

    const name = document.getElementById("search").value;
    const address = document.getElementById("address").value;
    const type = document.getElementById("type").value;

    if (!name || !address || !type) {
        console.error("Ошибка: Не заполнены обязательные поля.");
        alert("Пожалуйста, заполните обязательные поля: Название объекта, Адрес, Тип объекта.");
        return;
    }
    formData.append("name", name);
    formData.append("address", address);

    const isOpen = document.getElementById("isExcluded").checked;
    formData.append("excluded", isExcluded);

    if (type === 'Социальная инфраструктура') {
        const selectedRadio = document.querySelector('input[type="radio"]:checked');
        if (!selectedRadio) {
            console.error("Ошибка: Категория для социальной инфраструктуры не выбрана.");
            alert("Пожалуйста, выберите категорию для социальной инфраструктуры.");
            return;
        }
        formData.append("type", selectedRadio.value); 
    } else {
        formData.append("type", type);
    }
    formData.append("userId", userId);
    const description = document.getElementById("description").value;
    if (description) formData.append("description", description);

    const workingHours = document.getElementById("workingHours").value;
    if (workingHours) formData.append("workingHours", workingHours);

    const images = document.getElementById("images").files;
    for (let i = 0; i < images.length; i++) {
        formData.append("images", images[i]);
    }

    const accessibilityCheckboxes = document.querySelectorAll('input[name="accessibility"]:checked');
    if (accessibilityCheckboxes.length > 0) {
        accessibilityCheckboxes.forEach(checkbox => formData.append("accessibility", checkbox.value));
    }

    const disabilityCategoryCheckboxes = document.querySelectorAll('input[name="disabilityCategory"]:checked');
    if (disabilityCategoryCheckboxes.length > 0) {
        disabilityCategoryCheckboxes.forEach(checkbox => formData.append("disabilityCategory", checkbox.value));
    }

    fetch("http://localhost:5000/client/AddMapObject", {
        method: "POST",
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => { throw new Error(`Ошибка при отправке формы: ${text}`); });
        }

        return response.json();
    })
    .catch(error => console.error("Ошибка:", error));
    form.reset();
    socialInfrastructureFields.style.display = 'none';
    alert('Форма успешно отправлена!');
}

document.getElementById("search").addEventListener("input", async function (event) {
    const query = event.target.value.trim();
    const dropdown = document.getElementById("search-dropdown");

    if (!query) {
        dropdown.style.display = "none";
        return;
    }

    try {
        const encodedQuery = encodeURIComponent(query);
        const response = await fetch(`http://localhost:5000/api/SocialMapObject/SearchBy/?search=${encodedQuery}`);
        if (!response.ok) {
            throw new Error("Ошибка при получении данных.");
        }

        const data = await response.json();

        if (data.length === 0) {
            dropdown.style.display = "none";
            return;
        }

        dropdown.innerHTML = "";
        data.forEach(obj => {
            const option = document.createElement("option");
            option.value = obj.id;
            option.textContent = obj.display_name;
            option.setAttribute("data-object", JSON.stringify(obj));
            dropdown.appendChild(option);
        });

        dropdown.style.display = "block";
    } catch (error) {
        console.error(error);
        dropdown.style.display = "none";
    }
});

document.getElementById("search-dropdown").addEventListener("change", function (event) {
    const selectedOption = event.target.options[event.target.selectedIndex];
    
    const objectData = selectedOption.getAttribute("data-object");
    const object = JSON.parse(objectData);

    document.getElementById("search").value = object.display_name;
    
    const address = document.getElementById("address");
    const description = document.getElementById("description");
    const workingHours = document.getElementById("workingHours");

    address.value = object.address;
    description.value = object.description;
    workingHours.value = object.workingHours;

    event.target.style.display = "none";

    fetch('/client/getOntologyInfo', {
        method: 'POST',
        body: new URLSearchParams({ iri: object.iri }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
        .then(response => response.json())
        .then(data => {
            const categories = data.categories || [];
            categories.forEach(category => {
                const pureCategory = category.split('^^')[0]; 
                const checkbox = document.getElementById(`disabilityCategory${pureCategory}`);
                if (checkbox) {
                    checkbox.checked = true; 
                } else {
                    console.warn(`Чекбокс для категории ${pureCategory} не найден.`);
                }
            });

            const accessibilityElements = data.accessibilityElements || [];
            accessibilityElements.forEach(element => {
                const checkbox = Array.from(document.querySelectorAll('input[name="accessibility"]')).find(
                    el => el.value === element
                );
                if (checkbox) {
                    checkbox.checked = true; 
                }
            });
        })
        .catch(error => {
            console.error("Ошибка при запросе данных:", error);
        });
});

const map = L.map('map').setView([51.533557, 46.034257], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);
  
const provider = new GeoSearch.OpenStreetMapProvider();

const addressInput = document.getElementById('addressInput');
const suggestionsContainer = document.getElementById('suggestions');

addressInput.addEventListener('input', async () => {
    const query = addressInput.value.trim();

    if (query.length >= 1) {
        const results = await provider.search({ query });

        const filteredResults = results.filter(result => {
            const labelContainsRussia = result.label?.toLowerCase().includes('россия');
            return labelContainsRussia;
        });

        suggestionsContainer.innerHTML = '';

        filteredResults.forEach(result => {
            const suggestion = document.createElement('div');
            suggestion.classList.add('search-suggestion');
            suggestion.textContent = result.label;

            suggestion.addEventListener('click', () => {
                addressInput.value = result.label;
                document.getElementById('address').value = result.label;
                document.getElementById('latitude').value = result.y;
                document.getElementById('longitude').value = result.x;

                map.setView([result.y, result.x], 16);
                L.marker([result.y, result.x]).addTo(map);

                suggestionsContainer.innerHTML = '';
            });

            suggestionsContainer.appendChild(suggestion);
        });
    } else {
        suggestionsContainer.innerHTML = '';
    }
});

const attributionControl = document.querySelector('.leaflet-control-attribution');
if (attributionControl) {
    attributionControl.remove();
}

// Закрытие списка при клике вне поля
document.addEventListener('click', (event) => {
    if (!suggestionsContainer.contains(event.target) && event.target !== addressInput) {
        suggestionsContainer.innerHTML = '';
    }
});

const checkbox = document.getElementById('addressCheckbox');
const mapForAddress = document.getElementById('mapForAddress');

checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
        mapForAddress.style.display = 'block';
    } else {
        mapForAddress.style.display = 'none';
    }
});


