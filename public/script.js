
console.log('Loading script...');

const customerSelect = document.getElementById('customerSelect');
const newCustomerModal = document.getElementById('newCustomerModal');
const newCustomerForm = document.getElementById('newCustomerForm');
const newProductModal = document.getElementById('newProductModal');
const newProductForm = document.getElementById('newProductForm');
const productsGrid = document.getElementById('productsGrid');
const cartItems = document.getElementById('cartItems');
const resetBtn = document.getElementById('resetBtn');
const payBtn = document.getElementById('payBtn');
const newCustomerBtn = document.getElementById('newCustomerBtn');
const addProductBtn = document.getElementById('addProductBtn');
const categoryListBtn = document.getElementById('categoryListBtn'); 
const categoryList = document.getElementById('categoryList')


if (!customerSelect) console.error('Customer select not found');
if (!newCustomerForm) console.error('New customer form not found');
if (!newCustomerModal) console.error('New customer modal not found');


let cart = [];
let products = [];


newCustomerBtn.addEventListener('click', () => {
    newCustomerModal.style.display = 'block';
});

addProductBtn.addEventListener('click', () => {
    newProductModal.style.display = 'block';
});

categoryListBtn.addEventListener('click', () => {
    categoryList.classList.toggle('active'); 
});

window.addEventListener('click', (e) => {
    if (e.target !== categoryList && !categoryList.contains(e.target) && e.target !== categoryListBtn) {
        categoryList.classList.remove('active');
    }
});

async function loadCustomers() {
    try {
        const response = await fetch('/api/customers');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        
        customerSelect.innerHTML = '<option value="">Choose Customer</option>';
        
        data.customers.forEach(customer => {
            const option = document.createElement('option');
            option.value = customer._id;
            option.textContent = customer.name;
            customerSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading customers:', error);
    }
}


document.addEventListener('DOMContentLoaded', loadCustomers);


newCustomerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('Form submitted');

    const formData = new FormData(newCustomerForm);
    const customerData = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone')
    };

    console.log('Sending customer data:', customerData);

    try {
        const response = await fetch('/api/customers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(customerData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to add customer');
        }

        const newCustomer = await response.json();
        console.log('New customer added:', newCustomer);

       
        const option = document.createElement('option');
        option.value = newCustomer._id;
        option.textContent = newCustomer.name;
        customerSelect.appendChild(option);

        
        customerSelect.value = newCustomer._id;

      
        newCustomerModal.style.display = 'none';
        newCustomerForm.reset();

       
        await loadCustomers();

    } catch (error) {
        console.error('Error adding customer:', error);
        alert('Error adding customer: ' + error.message);
    }
});


document.querySelectorAll('.close-btn').forEach(button => {
    button.addEventListener('click', () => {
        newCustomerModal.style.display = 'none';
        newProductModal.style.display = 'none';
        newCustomerForm.reset();
    });
});


newProductForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(newProductForm);
    
    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            newProductModal.style.display = 'none';
            newProductForm.reset();
            
            loadProducts();
        }
    } catch (error) {
        console.error('Error adding product:', error);
    }
});


async function loadProducts(page = 1) {
    try {
        const response = await fetch(`/api/products?page=${page}`);
        const data = await response.json();
        products = data.products;
        renderProducts();
    } catch (error) {
        console.error('Error loading products:', error);
    }
}


function renderProducts() {
    productsGrid.innerHTML = '';
    products.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.innerHTML = `
            <img src="${product.image}" alt="${product.name}">
            <h3>${product.name}</h3>
            <p>$${product.price}</p>
            <button onclick="addToCart(${product.id})">Add to Cart</button>
        `;
        productsGrid.appendChild(productCard);
    });
}


function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (product) {
        const existingItem = cart.find(item => item.id === productId);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({
                id: product.id,
                name: product.name,
                price: product.price,
                quantity: 1
            });
        }
        renderCart();
    }
}


function renderProducts() {
    productsGrid.innerHTML = ''; 
    products.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.innerHTML = `
            <img src="${product.image}" alt="${product.name}">
            <h3>${product.name}</h3>
            <p>$${product.price}</p>
            <button class="buy-button">Buy</button>
            
        `;
        productsGrid.appendChild(productCard);
    });
}


function updateQuantity(productId, quantity) {
    const item = cart.find(item => item.id === productId);
    if (item) {
        item.quantity = parseInt(quantity);
        renderCart();
    }
}




resetBtn.addEventListener('click', () => {
    cart = [];
    renderCart();
});