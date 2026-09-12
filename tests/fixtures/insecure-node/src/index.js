// Insecure application with hardcoded secrets
const awsKey = "AKIA1234567890ABCDEF";
const conn = "postgres://admin:secretpassword123@db.example.com/mydb";
const key = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0";

console.log(awsKey, conn, key);
