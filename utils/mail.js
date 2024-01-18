const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'shivanshuguptawindows@gmail.com',
        pass: 'uvsi vtwf xyng rjza',
    },
});

/*  usage example:
    const sendMail = require('./utils/mail');
    sendMail({
        to: 'shivanshukgupta@gmail.com'
        subject: 'Test email',
        html: '<h1>Test email</h1><p>Test email</p>',
    });
*/
function sendMail(mailOptions) {
    if (!mailOptions.subject) mailOptions.subject = "Server Info Mail";
    if (!mailOptions.to) mailOptions.to = ["shivanshukgupta@gmail.com"];
    if (!mailOptions.html) mailOptions.html = "<h1>Test email</h1><p>Test email</p>";

    const { to, subject, html } = mailOptions;
    const mailOptions = {
        from: 'shivanshuguptawindows@gmail.com',
        to: to,
        subject: subject,
        html: html,
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
        } else {
            console.log('Email sent:', info.response);
        }
    });
}

module.exports = sendMail;