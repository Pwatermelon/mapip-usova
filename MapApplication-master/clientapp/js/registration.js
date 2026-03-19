const form = document.getElementById('authForm');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('name').value.trim();
    const category = document.getElementById('category').value;
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const password2 = document.getElementById('password-2').value;

    if (password !== password2) {
        alert('Пароли не совпадают. Проверьте введенные данные.');
        return;
    }

    try {
        const response = await fetch('/api/users/AddUser', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, type: parseInt(category), email, password })
        });

        if (response.ok) {
            
            try {
                const response = await fetch('/api/users/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ email, password })
                    });
        
                    if (response.ok) {
                        const data = await response.json();
        
                        if (data.success) {
                            window.location.href = '/clientapp/map.html';
                               
                        } else {
                            errorMessage.textContent = data.message || 'Ошибка авторизации';
                        }
                    } else {
                        errorMessage.textContent = 'Ошибка сервера';
                    }
                } catch (error) {
                    console.error('Ошибка:', error);
                    errorMessage.textContent = 'Произошла ошибка. Попробуйте позже.';
                }
        } else {
            

 const errorText = await response.text();
    const correctedErrorText = errorText.replace(/=/g, ":").replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":'); 
    const errorData = JSON.parse(correctedErrorText);
    alert(`Ошибка: ${errorData.message}`);

           
            alert(`Ошибка сервера: ${errorText}`);
            return;
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Произошла ошибка. Попробуйте позже.');
    }
});
