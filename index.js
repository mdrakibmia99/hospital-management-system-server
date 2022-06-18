const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
var jwt = require('jsonwebtoken');
var bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// csc2dW010kbGuude
// doctor_admin


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ypc0m.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.PRIVATE_KEY, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: "forbidden access" });
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {
        client.connect();
        const serviceCollection = client.db("doctorsPortal").collection("services");
        const bookingCollection = client.db("doctorsPortal").collection("bookings");
        const userCollection = client.db("doctorsPortal").collection("user");
        const doctorCollection = client.db("doctorsPortal").collection("doctors");
        const paymentCollection = client.db('doctorsPortal').collection('payments');
        const userReviewsCollection = client.db("doctorsPortal").collection("userReviews");
        const oncologistsCollection = client.db("doctorsPortal").collection("oncologists");
        console.log('hospital connected successfully!');

        const verifyAdmin = async(req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            } else {
                res.status(403).send({ message: "forbidden access" });
            }
        };

       

        // find services
        app.get('/services', async (req, res) => {
            const cursor = serviceCollection.find({}).project({ name: 1 });
            const services = await cursor.toArray();

            res.send(services);
        })

        // add new booking
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatmentName: booking.treatmentName, patientName: booking.patientName, appointmentDate: booking.appointmentDate };
            const existBooking = await bookingCollection.findOne(query);

            if (existBooking) {
                return res.send({ success: false, result: existBooking });
            }

            const result = await bookingCollection.insertOne(booking);
            const result1 = await oncologistsCollection.insertOne(booking);

            return res.send({ success: true, result });
        })

        // get all bookings
        app.get('/bookings', verifyJWT, async (req, res) => {
            const patientEmail = req.query.email;
            const decodedEmail = req.decoded.email;

            if (patientEmail === decodedEmail) {
                const query = { patientEmail: patientEmail };
                const bookings = await bookingCollection.find(query).toArray();
                res.send(bookings);
            } else {
                res.status(403).send({ message: "forbidden access" });
            }
        })

        // service based on service id
        app.get('/booking/:id', verifyJWT, async (req, res) => {
            res.send(await bookingCollection.findOne({ _id: ObjectId(req.params.id) }));
         
        })

   

        app.get('/available', async (req, res) => {
            const date = req.query.date;

            /* step 1: find all services */
            const services = await serviceCollection.find({}).toArray();

            /* step 2: get the booking for that specific date */
            const query = { appointmentDate: date };
            const bookings = await bookingCollection.find(query).toArray();

            /* step 3: for each service find bookings for that service */
            services.forEach(service => {
                // step 1: get service bookings with respect services
                const serviceBookings = bookings.filter(booking => service.name === booking.treatmentName);
                // step 2: make a view of booked time for each service
                const booked = serviceBookings.map(serviceBooking => serviceBooking.appointmentTime);
                service.booked = booked;
                // step 3: display available time exclude booked one
                const available = service.slots.filter(svc => !booked.includes(svc));
                service.slots = available;
            })

            res.send(services);
        })

        // add/update user
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.PRIVATE_KEY, { expiresIn: '1d' });
            res.send({ result, token });
        })

        // add/update admin
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' }
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            const token = jwt.sign({ email: email }, process.env.PRIVATE_KEY, { expiresIn: '1d' });
            res.send({ result, token });
        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })

        // get doctors 
        app.get('/doctor/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isDoctor = user.role === 'doctor';
            res.send({ doctor: isDoctor });
        })

        

        // display users
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find({}).toArray();
            res.send(users);
        })

        // delete a user
        app.delete('/user/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await userCollection.deleteOne(filter);
            res.send(result);
        })

        // add a doctor
        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        })
        // oncologistsCollection 
        app.post('/oncologists', async (req, res) => {
            const doctor = req.body;
            const result = await oncologistsCollection.insertOne(doctor);
            res.send(result);
        })

        // display all doctors
        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find({}).toArray();
            res.send(doctors);
        })
        app.get('/oncologists', async (req, res) => {
            const doctors = await oncologistsCollection.find({}).toArray();
            res.send(doctors);
        })

        // delete a doctor
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        })

        // approaching payment intent api
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            const price = service?.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            });

            res.send({ clientSecret: paymentIntent.client_secret });
        })

      

        // add payment status and transaction id
        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
            res.send(updatedBooking);
        })
 
        // this api for get review info 
        app.get('/reviews', async (req, res) => {
            const reviews = await userReviewsCollection.find({}).toArray();
            res.send(reviews);
        })

        // add user review
        app.put('/reviews/:email', async (req, res) => {
            const reviewerEmail = req.params.email;
            const userReview = req.body;

            const filter = { reviewerEmail: reviewerEmail };
            const options = { upsert: true };
            const updateDoc = {
                $set: userReview
            };
            const usersReview = await userReviewsCollection.updateOne(filter, updateDoc, options);
            res.send(usersReview);
        })

    } finally {
        // client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hospital management backend started!')
});

app.listen(port, () => {
    console.log(`hospital management backend connected on port ${port}`)
});
