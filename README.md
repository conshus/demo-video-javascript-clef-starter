# Vonage Video API x TypeSafe AI Jev demo

This application is intended to showcase to developers a possible use case of [Vonage Video API](https://developer.vonage.com/en/video/overview?source=video) and [TypeSafe AI](https://typesafe.ai/) to create an AI support agent that quickly detects if a user is getting frustrated and start a video call with a Human agent.

## Features

- The Vonage Video API [Signaling](https://developer.vonage.com/en/video/guides/signaling?source=video) is used to send notifications to the Employees' dashboard.
- TypeSafe AI's [Jev](https://docs.typesafe.ai/introduction) analyzes the user's chat messages and determines the sentiment and frustration level that is used to create an escalation to video call or pass the message to the AI agent.

## Get started

The easiest way to run this application is by using GitHub Codespaces. This sets up the entire environment automatically in your browser.

1. **Fork this repository** to your own GitHub account.
2. In your new fork, click the green **<> Code** button at the top right of the files list.
3. Select the **Codespaces** tab.
4. Click **Create codespace on main**.

Once the environment loads, the setup script will run automatically to configure your Vonage application!

The setup script will create the Vonage Application needed for the Video chat. It will ask for API Key and API Secret which can be found in the [Vonage Dashboard](https://dashboard.vonage.com)

The script will also ask for your TypeSafe AI API Key. You can find that in the [TypeSafe AI dashboard](https://console.typesafe.ai/keys).

## How to Use
Once setup, there should be a URL in the terminal that you can click to launch the application in a new browser tab. If not, you can go to the `Ports` tab next to the `Terminal` tab and right click the URL under `Forwarded Address`.

This page will have the fake AI support agent.

To open the employee dashboard, click the "Go to Employee Dashboard" link at the top.

If you enter a chat message that shows frustration or asks to speak with a real person, the application will offer the user the option to start a video call. A card will show up in the Employee dashboard with details on the sentiment, frustration level and last message from the user with an `Answer call` button that will add the employee to the video call.