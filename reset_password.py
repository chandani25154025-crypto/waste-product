import sqlite3
from getpass import getpass
from werkzeug.security import generate_password_hash

DATABASE = "reloop.db"

username = input("Enter username: ").strip()

new_password = getpass("Enter new password: ")
confirm_password = getpass("Confirm new password: ")

if len(new_password) < 8:
    print("Password must be at least 8 characters.")
    
elif new_password != confirm_password:
    print("Passwords do not match.")

else:
    connection = sqlite3.connect(DATABASE)

    cursor = connection.execute(
        "UPDATE users SET password = ? WHERE username = ?",
        (generate_password_hash(new_password), username)
    )

    connection.commit()

    if cursor.rowcount == 1:
        print("Password reset successful!")
        print("Your existing EcoPoints are safe.")
    else:
        print("Username not found.")

    connection.close()