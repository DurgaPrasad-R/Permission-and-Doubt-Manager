const express = require('express')
const admin = require("firebase-admin");
const { getFirestore } = require('firebase-admin/firestore');
const passwordHash = require('password-hash');
var serviceAccount = require("./Key.json");
const app = express()
const port = 3000

app.use(express.json());
app.use(express.urlencoded());

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

app.use(express.static("public"));
app.set('view engine', 'ejs');
const db = getFirestore();

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.get('/signup', (req, res) => {
    res.sendFile(__dirname + '/public/signup.html');
});

app.post('/signup', async (req, res) => {
    const email = req.body.Email;
  
    // Checking if the user with the provided email already exists
    const existingUser = await db.collection('First')
      .where('Email', '==', email)
      .get();
  
    if (!existingUser.empty) {
      // User already exists, redirect to the login page
      res.send("User already exists, redirect to the login page");
    } else {
      // User is not registered, details added to db
      await db.collection('First').add({
        Name: req.body.Name,
        Email: email,
        Regd_No: req.body.regd_no,
        Password: passwordHash.generate(req.body.Password)
      }).then(() => {
        // Sending a success message and then redirect to the login page
        res.send("Signup Successful");
      });
    }
});

app.post('/login', async (req, res) => {
    const querySnapShot = await db.collection('First')
      .where("Regd_No", "==", req.body.regd_no)
      .get();
  
    if (!querySnapShot.empty) {
      const doc = querySnapShot.docs[0];
      const PasswordHash = doc.get("Password");
  
      if (passwordHash.verify(req.body.Password, PasswordHash)) {
        // Send a success alert message and then redirect or perform any other actions
        res.send("Success!!");
      } else {
        res.send("Credentials Wrong!!");
      }
    } else {
      // User not found, you can send an alert or error message
      res.send("Email Not Found");
    }
});

app.listen(port, () => {
    console.log(`App listening on port http://localhost:${port}`);
})