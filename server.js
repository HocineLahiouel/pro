const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();

// Security Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Internal Server Error',
            status: err.status || 500
        }
    });
};

// Multer configuration with error handling
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './public/uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed!'));
    }
}).single('productImage');

// MongoDB connection with retry logic
const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://localhost/pos_system', {
            serverSelectionTimeoutMS: 5000, // Optional, keeps the connection timeout logic
            retryWrites: true               // Optional, enables retryable writes
        });
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};


connectDB();

// Models
const Customer = require('./models/Customer');
const Product = require('./models/Product');
const Order = require('./models/Order');

// Validation middleware
const validateCustomer = (req, res, next) => {
    const { name, email, phone } = req.body;
    if (!name || !email || !phone) {
        return res.status(400).json({ message: 'All fields are required' });
    }
    if (!email.match(/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }
    next();
};

// Routes with async/await error handling
// Customer Routes
app.post('/api/customers', validateCustomer, async (req, res, next) => {
    try {
        const existingCustomer = await Customer.findOne({ email: req.body.email });
        if (existingCustomer) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        const customer = new Customer({
            name: req.body.name,
            email: req.body.email,
            phone: req.body.phone
        });
        const savedCustomer = await customer.save();
        res.status(201).json(savedCustomer);
    } catch (error) {
        next(error);
    }
});

app.get('/api/customers', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const customers = await Customer.find()
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const total = await Customer.countDocuments();

        res.json({
            customers,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total
        });
    } catch (error) {
        next(error);
    }
});

// Product Routes
app.post('/api/products', async (req, res, next) => {
    upload(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ message: 'File upload error' });
        } else if (err) {
            return res.status(400).json({ message: err.message });
        }

        try {
            if (!req.body.productName || !req.body.price || !req.file) {
                return res.status(400).json({ message: 'All fields are required' });
            }

            const product = new Product({
                name: req.body.productName,
                price: parseFloat(req.body.price),
                image: `/uploads/${req.file.filename}`
            });
            const savedProduct = await product.save();
            res.status(201).json(savedProduct);
        } catch (error) {
            next(error);
        }
    });
});

app.get('/api/products', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const search = req.query.search || '';
        const skip = (page - 1) * limit;

        const query = search
            ? {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ]
            }
            : {};

        const products = await Product.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const total = await Product.countDocuments(query);

        res.json({
            products,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total
        });
    } catch (error) {
        next(error);
    }
});
// Delete product by ID
app.delete('/api/products/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        await Product.findByIdAndDelete(productId);
        res.status(200).send({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).send({ message: 'Error deleting product' });
    }
});

// Order Routes
app.post('/api/orders', async (req, res, next) => {
    try {
        const { customerId, items, total, tax, discount, shipping } = req.body;

        if (!customerId || !items || !total) {
            return res.status(400).json({ message: 'Required fields missing' });
        }

        // Validate customer exists
        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Validate products exist and calculate total
        let calculatedTotal = 0;
        for (const item of items) {
            const product = await Product.findById(item.product);
            if (!product) {
                return res.status(404).json({ message: `Product ${item.product} not found` });
            }
            calculatedTotal += product.price * item.quantity;
        }

        // Verify total matches calculated total (within cents difference for floating point precision)
        if (Math.abs(calculatedTotal - total) > 0.01) {
            return res.status(400).json({ message: 'Order total mismatch' });
        }

        const order = new Order({
            customer: customerId,
            items,
            total,
            tax: tax || 0,
            discount: discount || 0,
            shipping: shipping || 0
        });

        const savedOrder = await order.save();
        res.status(201).json(savedOrder);
    } catch (error) {
        next(error);
    }
});

app.get('/api/orders', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const orders = await Order.find()
            .populate('customer', 'name email')
            .populate('items.product', 'name price')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const total = await Order.countDocuments();

        res.json({
            orders,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total
        });
    } catch (error) {
        next(error);
    }
});

// Use error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed.');
            process.exit(0);
        });
    });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));