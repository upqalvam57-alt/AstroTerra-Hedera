import os
import time
from dotenv import load_dotenv
from hiero_sdk_python import (
    Client,
    AccountId,
    PrivateKey,
    TopicCreateTransaction,
    TopicMessageSubmitTransaction,
    TopicId
)

# Load environment variables from .env file
load_dotenv()

def get_hedera_client():
    """Initializes and returns the Hedera client for Testnet."""
    account_id_str = os.getenv("OPERATOR_ID")
    private_key_str = os.getenv("OPERATOR_KEY")

    if not account_id_str or not private_key_str or "YOUR_ACCOUNT_ID" in account_id_str:
        raise Exception("OPERATOR_ID and OPERATOR_KEY must be set correctly in the Backend/.env file.")

    # Initialize your testnet client and set operator
    client = Client()
    client.set_operator(AccountId.from_string(account_id_str), PrivateKey.from_string(private_key_str))
    return client

def create_hcs_topic():
    """Creates a new Hedera Consensus Service (HCS) topic and returns the Topic ID."""
    client = get_hedera_client()
    print("Creating a new HCS topic...")

    # Create a new topic
    transaction = TopicCreateTransaction()
    
    try:
        # Execute the transaction and get the receipt
        receipt = transaction.execute(client)
        
        # Get the new topic ID from the receipt
        topic_id = receipt.topic_id
        
        print(f"Successfully created new topic with ID: {topic_id}")
        return topic_id
    except Exception as e:
        print(f"Error creating HCS topic: {e}")
        return None

def submit_hcs_message(topic_id_str, message):
    """Submits a message to a specified HCS topic."""
    client = get_hedera_client()
    topic_id = TopicId.from_string(topic_id_str)
    
    print(f"Submitting message to topic {topic_id}: {message}")

    # Create the transaction
    transaction = TopicMessageSubmitTransaction().set_topic_id(topic_id).set_message(message)

    try:
        # Execute the transaction and get the receipt
        receipt = transaction.execute(client)
        
        # Get the transaction consensus status
        transaction_status = receipt.status
        print(f"The message transaction consensus status: {transaction_status}")
        return True
    except Exception as e:
        print(f"Error submitting message to HCS topic: {e}")
        return False
