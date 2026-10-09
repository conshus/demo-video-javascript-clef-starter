# Vonage Video API x Cloudflare Clef demo

This application is intended to showcase to developers a possible use case of [Vonage Video API](https://developer.vonage.com/en/video/overview?source=video) and [Cloudflare](https://cloudflare.com/) to create a vehicle accident reporting application that will analyze the images with AI to determine the severity of the damage and if necessary connect to a live video call with a Human insurance agent.

## Features

- The Vonage Video API [Signaling](https://developer.vonage.com/en/video/guides/signaling?source=video) is used to send notifications to the Insurance Agent's dashboard.
- Cloudflare's [Clef](https://developers.cloudflare.com/workers-ai/models/clef/) analyzes the images submitted and decides on the severity of the damage.

## Get started

The easiest way to run this application is by using GitHub Codespaces. This sets up the entire environment automatically in your browser.

1. **Fork this repository** to your own GitHub account.
2. In your new fork, click the green **<> Code** button at the top right of the files list.
3. Select the **Codespaces** tab.
4. Click **Create codespace on main**.

Once the environment loads, the setup script will run automatically to configure your Vonage application!

The setup script will create the Vonage Application needed for the Video chat. It will ask for `API Key` and `API Secret` which can be found in the [Vonage Dashboard](https://dashboard.vonage.com)

The script will also ask for your Cloudflare `Account ID` and `Auth/API Key`. You can find these in the [Cloudflare dashboard](https://dash.cloudflare.com/).

## How to Use
Once setup, there should be a URL in the terminal that you can click to launch the application in a new browser tab. If not, you can go to the `Ports` tab next to the `Terminal` tab and right click the URL under `Forwarded Address`.

This page will allow to do a few things.

To open the insurance agent dashboard, click the "Open Agent Dashboard" link at the top.

Scan the QR code on your phone to the claim submission page.

There are sample images that you can take photos of to submit with your claim that will trigger the different responses.

If it is determined that a live call with an agent is needed, you will be able to start a call. 

A card will pop up on the insurance agent's dashboard with some information and allowing you to join the call.