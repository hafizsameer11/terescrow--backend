
import socket

def get_ip_from_tiktok_username(username: str) -> str:
    """
    Function to retrieve the IP address associated with a TikTok username.

    Parameters:
    - username: str
        The TikTok username for which the IP address is to be found.

    Returns:
    - str
        The IP address corresponding to the provided TikTok username.

    Raises:
    - ValueError
        If the provided username is empty or invalid.
    - socket.gaierror
        If the IP address lookup fails due to network issues or invalid domain.
    """

    if not username:
        raise ValueError("Invalid TikTok username provided.")

    try:
        url = f"https://www.tiktok.com/@{username}"
        ip_address = socket.gethostbyname(url)
        return ip_address
    except socket.gaierror as e:
        raise socket.gaierror(f"Error getting IP address for {username}: {e}")


try:
    tiktok_username = "80alaajutt"
    ip_address = get_ip_from_tiktok_username(tiktok_username)
    print(f"The IP address for TikTok username '{tiktok_username}' is: {ip_address}")
except (ValueError, socket.gaierror) as e:
    print(f"Error: {e}")
                    