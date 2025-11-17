import os
import time
import httpx
import base64
import json
from datetime import datetime, timezone
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

async def get_audit_trail():
    """
    Fetches and processes the audit trail from the Hedera Mirror Node.
    """
    topic_id = os.getenv("HCS_TOPIC_ID")
    mirror_node_url = os.getenv("HEDERA_MIRROR_NODE_URL")

    if not topic_id or not mirror_node_url:
        raise Exception("HCS_TOPIC_ID and HEDERA_MIRROR_NODE_URL must be set in the .env file.")

    url = f"{mirror_node_url}/api/v1/topics/{topic_id}/messages"
    
    processed_messages = []

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()  # Raise an exception for non-200 status codes
            try:
                data = resp.json()
            except json.JSONDecodeError:
                # The response body is empty or not valid JSON, return an empty list
                return []

            for message in data.get("messages", []):
                try:
                    # Decode the base64 message
                    decoded_message = base64.b64decode(message["message"]).decode("utf-8")
                    # Parse the JSON content of the message
                    audit_data = json.loads(decoded_message)
                    
                    processed_messages.append({
                        "consensus_timestamp": message["consensus_timestamp"],
                        "sequence_number": message["sequence_number"],
                        "audit_data": audit_data
                    })
                except (json.JSONDecodeError, UnicodeDecodeError, TypeError) as e:
                    print(f"Skipping malformed message (seq: {message.get('sequence_number')}): {e}")
                    continue
            
            # Return messages ordered from most recent to oldest (API already does this)
            return processed_messages

        except httpx.HTTPStatusError as e:
            print(f"Error fetching audit trail from mirror node: {e}")
            # Depending on the desired behavior, you might want to return an empty list
            # or re-raise the exception to be handled by the caller.
            raise
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            raise

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

def submit_hcs_message(topic_id_str, message_text):
    """Submits a message to a specified HCS topic."""
    client = get_hedera_client()
    topic_id = TopicId.from_string(topic_id_str)
    
    # --- FIX: Wrap the message in a JSON object ---
    audit_message = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "message": message_text
    }
    message_json = json.dumps(audit_message)
    
    print(f"Submitting message to topic {topic_id}: {message_json}")

    # Create the transaction
    transaction = TopicMessageSubmitTransaction().set_topic_id(topic_id).set_message(message_json)

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