import hedera_service

def main():
    """
    Runs the setup process for Hedera services.
    This script should be run once to create the necessary Hedera resources.
    """
    print("--- Starting Hedera Setup ---")
    
    # Create a new HCS topic for auditing simulation results
    topic_id = hedera_service.create_hcs_topic()
    
    if topic_id:
        print("\n--- Setup Complete ---")
        print(f"Action Required: Please add the following line to your Backend/.env file:")
        print(f'HEDERA_TOPIC_ID="{topic_id}"')
    else:
        print("\n--- Setup Failed ---")
        print("Please check the error messages above and your .env configuration.")

if __name__ == "__main__":
    main()
