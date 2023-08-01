# Use the official Node.js image as the base image
FROM node:14

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Install the MySQL client
RUN apt-get update && apt-get install -y default-mysql-client

# Copy the rest of the application files to the container
COPY . .

# Expose port 3000
EXPOSE 3000

# Start the Node.js application
CMD ["node", "server.js"]