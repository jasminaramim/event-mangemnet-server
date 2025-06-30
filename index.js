require("dotenv").config()

const express = require("express")
const cors = require("cors")
const bodyParser = require("body-parser")
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb")
const jwt = require("jsonwebtoken")
const cookieParser = require("cookie-parser")
const multer = require("multer")
const port = process.env.PORT || 5000

const app = express()


app.use(express.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  }),
)

// Multer setup
const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

// MongoDB URI and connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_KEY}@cluster0.ssmpl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {
    await client.connect()
    console.log("✅ Connected to MongoDB")

    const db = client.db("Event-management")
    const userCollection = db.collection("users")
    const eventCollection = db.collection("events")

    // POST: Add new user
    app.post("/users", async (req, res) => {
      try {
        const user = req.body
        const existingUser = await userCollection.findOne({ email: user.email })

        if (existingUser) {
          return res.status(409).json({ message: "User already exists" })
        }

        const result = await userCollection.insertOne(user)
        res.status(201).json(result)
      } catch (error) {
        console.error("Error adding user:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    })

    // GET: Get all users
    app.get("/users", async (req, res) => {
      try {
        const users = await userCollection.find({}).toArray()
        res.status(200).json(users)
      } catch (error) {
        console.error("Error fetching users:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    })

    // GET: Get user by email
    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email
        const user = await userCollection.findOne({ email })
        if (!user) return res.status(404).json({ message: "User not found" })

        res.json(user)
      } catch (error) {
        console.error("Error fetching user:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    })

    // DELETE: Delete a user
    app.delete("/users/:id", async (req, res) => {
      try {
        const result = await userCollection.deleteOne({ _id: new ObjectId(req.params.id) })
        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "User not found" })
        }

        res.status(200).json({ message: "User deleted successfully" })
      } catch (error) {
        console.error("Error deleting user:", error)
        res.status(500).json({ message: "Internal server error: " + error.message })
      }
    })

    // POST: Create a new event
    app.post("/events", async (req, res) => {
      try {
        const eventData = req.body

        // Validate maxAttendees
        const maxAttendees = Number.parseInt(eventData.maxAttendees) || 0
        if (maxAttendees < 0) {
          return res.status(400).json({ success: false, message: "Maximum attendees cannot be negative" })
        }

        const result = await eventCollection.insertOne({
          ...eventData,
          maxAttendees: maxAttendees,
          currentAttendees: 0,
          attendees: [], 
          createdAt: new Date(),
        })

        console.log("✅ Event created:", result.insertedId)

        res.status(201).json({
          success: true,
          message: "Event created successfully!",
          eventId: result.insertedId,
        })
      } catch (error) {
        console.error("Error adding event:", error)
        res.status(500).json({ success: false, message: "Internal server error" })
      }
    })

    // PUT: Update an existing event
    app.put("/events/:id", async (req, res) => {
      try {
        const eventId = req.params.id
        const updateData = req.body
        const { creatorEmail } = updateData

        console.log(`🔄 Update request for event ${eventId}`)

        // Validate ObjectId
        if (!ObjectId.isValid(eventId)) {
          return res.status(400).json({ success: false, message: "Invalid event ID" })
        }

        // Find the event first to check ownership and current state
        const existingEvent = await eventCollection.findOne({ _id: new ObjectId(eventId) })

        if (!existingEvent) {
          return res.status(404).json({ success: false, message: "Event not found" })
        }

        if (existingEvent.creatorEmail && creatorEmail && existingEvent.creatorEmail !== creatorEmail) {
          return res.status(403).json({ success: false, message: "You don't have permission to update this event" })
        }

        const currentAttendees = existingEvent.currentAttendees || 0
        if (updateData.maxAttendees && updateData.maxAttendees > 0 && updateData.maxAttendees < currentAttendees) {
          return res.status(400).json({
            success: false,
            message: `Maximum attendees cannot be less than current attendees (${currentAttendees})`,
          })
        }

        const { _id, attendees, currentAttendees: _, createdAt, ...cleanUpdateData } = updateData

        // Add updatedAt timestamp
        cleanUpdateData.updatedAt = new Date()

        console.log("📊 Updating event with data:", cleanUpdateData)

        // Update the event
        const result = await eventCollection.updateOne({ _id: new ObjectId(eventId) }, { $set: cleanUpdateData })

        if (result.matchedCount === 0) {
          return res.status(404).json({ success: false, message: "Event not found" })
        }

        if (result.modifiedCount === 0) {
          return res.status(200).json({
            success: true,
            message: "No changes were made to the event",
            eventId: eventId,
          })
        }

        console.log(`✅ Event ${eventId} updated successfully`)

        res.status(200).json({
          success: true,
          message: "Event updated successfully!",
          eventId: eventId,
        })
      } catch (error) {
        console.error("❌ Error updating event:", error)
        res.status(500).json({
          success: false,
          message: "Internal server error. Please try again later.",
        })
      }
    })

    // GET: Get event by ID
    app.get("/events/:id", async (req, res) => {
      try {
        const eventId = req.params.id

        if (!ObjectId.isValid(eventId)) {
          return res.status(400).json({ success: false, message: "Invalid event ID" })
        }

        const event = await eventCollection.findOne({ _id: new ObjectId(eventId) })

        if (!event) {
          return res.status(404).json({ success: false, message: "Event not found" })
        }

        res.status(200).json(event)
      } catch (error) {
        console.error("Error fetching event:", error)
        res.status(500).json({ success: false, message: "Internal server error" })
      }
    })

    // POST: Join an event (FIXED VERSION WITH BETTER LOGGING)
    app.post("/events/:id/join", async (req, res) => {
      try {
        const eventId = req.params.id
        const { email } = req.body

        console.log(`🔄 Join request for event ${eventId} by ${email}`)

        if (!email) {
          return res.status(400).json({ success: false, message: "User email is required" })
        }

        if (!ObjectId.isValid(eventId)) {
          return res.status(400).json({ success: false, message: "Invalid event ID" })
        }

        // Find the event with current data
        const event = await eventCollection.findOne({ _id: new ObjectId(eventId) })
        if (!event) {
          return res.status(404).json({ success: false, message: "Event not found" })
        }

        console.log("📊 Current event data:", {
          title: event.title,
          currentAttendees: event.currentAttendees,
          maxAttendees: event.maxAttendees,
          attendees: event.attendees,
        })

        // Initialize attendees array if it doesn't exist
        const attendees = Array.isArray(event.attendees) ? event.attendees : []
        const currentAttendees = event.currentAttendees || 0

        const normalizedEmail = email.toLowerCase().trim()
        const thisUserAlreadyJoined = attendees.some((attendee) => {
          if (typeof attendee !== "string") return false
          return attendee.toLowerCase().trim() === normalizedEmail
        })

        console.log("🔍 Join check:", {
          userEmail: email,
          normalizedEmail: normalizedEmail,
          attendees: attendees,
          alreadyJoined: thisUserAlreadyJoined,
        })

        if (thisUserAlreadyJoined) {
          console.log(`❌ User ${email} has already joined event ${eventId}`)
          return res.status(400).json({
            success: false,
            message: "You have already joined this event",
          })
        }

        // Check if the event is full
        if (event.maxAttendees > 0 && currentAttendees >= event.maxAttendees) {
          console.log(`❌ Event ${eventId} is full (${currentAttendees}/${event.maxAttendees})`)
          return res.status(400).json({
            success: false,
            message: "Event is full. No more spots available.",
          })
        }

        const updateResult = await eventCollection.findOneAndUpdate(
          {
            _id: new ObjectId(eventId),
            attendees: { $not: { $elemMatch: { $regex: new RegExp(`^${normalizedEmail}$`, "i") } } },
          },
          {
            $inc: { currentAttendees: 1 },
            $addToSet: { attendees: email },
          },
          {
            returnDocument: "after", 
          },
        )

        if (!updateResult.value) {
          console.log(`❌ Failed to update event ${eventId} - user ${email} may have already joined`)
          return res.status(400).json({
            success: false,
            message: "Unable to join event. You may have already joined or the event may be full.",
          })
        }

        console.log(
          `✅ User ${email} successfully joined event ${eventId}. Current attendees: ${updateResult.value.currentAttendees}`,
        )
        console.log("📊 Updated attendees list:", updateResult.value.attendees)

        res.status(200).json({
          success: true,
          message: "Successfully joined the event!",
          currentAttendees: updateResult.value.currentAttendees,
          eventId: eventId,
          userEmail: email,
        })
      } catch (error) {
        console.error("❌ Error joining event:", error)
        res.status(500).json({
          success: false,
          message: "Internal server error. Please try again later.",
        })
      }
    })

    // GET: Check if specific user has joined an event
    app.get("/events/:id/check-join/:email", async (req, res) => {
      try {
        const eventId = req.params.id
        const email = req.params.email

        if (!ObjectId.isValid(eventId)) {
          return res.status(400).json({ success: false, message: "Invalid event ID" })
        }

        const event = await eventCollection.findOne({ _id: new ObjectId(eventId) })
        if (!event) {
          return res.status(404).json({ success: false, message: "Event not found" })
        }

        const attendees = Array.isArray(event.attendees) ? event.attendees : []
        const hasJoined = attendees.some((attendee) => {
          if (typeof attendee !== "string") return false
          return attendee.toLowerCase().trim() === email.toLowerCase().trim()
        })

        res.status(200).json({
          success: true,
          hasJoined: hasJoined,
          currentAttendees: event.currentAttendees || 0,
          maxAttendees: event.maxAttendees || 0,
          userEmail: email,
          attendees: attendees,
        })
      } catch (error) {
        console.error("Error checking join status:", error)
        res.status(500).json({ success: false, message: "Internal server error" })
      }
    })

    // GET: Get all events
    app.get("/events", async (req, res) => {
      try {
        const events = await eventCollection.find({}).toArray()
        console.log(`📊 Fetched ${events.length} events`)
        res.status(200).json(events)
      } catch (error) {
        console.error("Error fetching events:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    })

    // GET: Get events by creator email
    app.get("/events/email/:email", async (req, res) => {
      const email = req.params.email
      console.log("Received Email:", email)

      try {
        const query = { creatorEmail: email }
        const result = await eventCollection.find(query).toArray()
        res.status(200).json(result)
      } catch (error) {
        console.error("Error fetching events:", error)
        res.status(500).json({ message: "Failed to fetch events" })
      }
    })

    // DELETE: Delete specific event by ID
    app.delete("/events/:id", async (req, res) => {
      try {
        const result = await eventCollection.deleteOne({ _id: new ObjectId(req.params.id) })
        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Event not found" })
        }

        res.status(200).json({ success: true, message: "Event deleted successfully" })
      } catch (error) {
        console.error("Error deleting event:", error)
        res.status(500).json({ success: false, message: "Internal server error" })
      }
    })

    // POST: Generate JWT
    app.post("/jwt", async (req, res) => {
      try {
        const { email } = req.body
        if (!email) {
          return res.status(400).json({ message: "Email is required" })
        }

        const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "1h" })
        res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production" })
        res.status(200).json({ success: true, token })
      } catch (error) {
        console.error("Error generating JWT:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    })

    // GET: Logout
    app.get("/logout", (req, res) => {
      try {
        res.clearCookie("token")
        res.status(200).json({ success: true, message: "Logged out successfully" })
      } catch (error) {
        console.error("Error during logout:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    })
  } catch (err) {
    console.error("MongoDB connection error:", err)
  }
}

run().catch(console.dir)

// Root route
app.get("/", (req, res) => {
  res.send("🎉 Event Management Server is Running!")
})

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`)
})
