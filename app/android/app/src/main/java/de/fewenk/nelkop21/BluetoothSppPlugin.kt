package de.fewenk.nelkop21

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.os.Build
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Bluetooth Classic SPP/RFCOMM transport for the Nelko P21.
 *
 * Connects to a bonded device over the standard Serial Port Profile UUID and
 * exchanges raw bytes (base64-encoded across the Capacitor bridge so binary
 * payloads such as the bitmap survive intact). A background reader thread fills
 * a buffer that `read()` consumes, matching the request/response pattern used by
 * the printer protocol.
 */
@CapacitorPlugin(
    name = "BluetoothSpp",
    permissions = [
        Permission(
            alias = "bluetooth",
            strings = [
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN,
            ],
        ),
    ],
)
class BluetoothSppPlugin : Plugin() {

    companion object {
        const val ALIAS_BLUETOOTH = "bluetooth"
        private val SPP_UUID: UUID =
            UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private const val DEFAULT_TIMEOUT_MS = 1000
    }

    private val io = Executors.newSingleThreadExecutor()

    private var socket: BluetoothSocket? = null
    private var output: OutputStream? = null
    private var input: InputStream? = null

    private val bufferLock = Object()
    private var buffer = ByteArray(0)
    @Volatile private var readerThread: Thread? = null

    // --- permissions ---------------------------------------------------------

    private fun runtimePermissionRequired(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    private fun hasBluetoothPermission(): Boolean =
        !runtimePermissionRequired() ||
            getPermissionState(ALIAS_BLUETOOTH) == PermissionState.GRANTED

    @PermissionCallback
    private fun bluetoothPermissionCallback(call: PluginCall) {
        if (!hasBluetoothPermission()) {
            call.reject("Bluetooth permission denied")
            return
        }
        when (call.methodName) {
            "listDevices" -> listDevices(call)
            "connect" -> connect(call)
            else -> call.reject("Unknown method: ${call.methodName}")
        }
    }

    private fun adapter(): BluetoothAdapter? {
        val manager =
            context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return manager?.adapter
    }

    // --- methods -------------------------------------------------------------

    @PluginMethod
    @SuppressLint("MissingPermission")
    fun listDevices(call: PluginCall) {
        if (!hasBluetoothPermission()) {
            requestPermissionForAlias(ALIAS_BLUETOOTH, call, "bluetoothPermissionCallback")
            return
        }
        val adapter = adapter()
        if (adapter == null || !adapter.isEnabled) {
            call.reject("Bluetooth is unavailable or disabled")
            return
        }
        val devices = JSArray()
        for (device in adapter.bondedDevices) {
            val entry = JSObject()
            entry.put("id", device.address)
            entry.put("name", device.name ?: device.address)
            devices.put(entry)
        }
        val result = JSObject()
        result.put("devices", devices)
        call.resolve(result)
    }

    @PluginMethod
    @SuppressLint("MissingPermission")
    fun connect(call: PluginCall) {
        if (!hasBluetoothPermission()) {
            requestPermissionForAlias(ALIAS_BLUETOOTH, call, "bluetoothPermissionCallback")
            return
        }
        val address = call.getString("address")
        if (address.isNullOrBlank()) {
            call.reject("Missing 'address'")
            return
        }
        val adapter = adapter()
        if (adapter == null || !adapter.isEnabled) {
            call.reject("Bluetooth is unavailable or disabled")
            return
        }

        io.execute {
            try {
                closeConnection()
                adapter.cancelDiscovery()
                val device = adapter.getRemoteDevice(address)
                val sock = device.createRfcommSocketToServiceRecord(SPP_UUID)
                sock.connect()
                socket = sock
                output = sock.outputStream
                input = sock.inputStream
                startReader()
                call.resolve()
            } catch (e: Exception) {
                closeConnection()
                call.reject("Failed to connect: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        io.execute {
            closeConnection()
            call.resolve()
        }
    }

    @PluginMethod
    fun isConnected(call: PluginCall) {
        val result = JSObject()
        result.put("connected", socket?.isConnected == true)
        call.resolve(result)
    }

    @PluginMethod
    fun write(call: PluginCall) {
        val data = call.getString("data")
        if (data == null) {
            call.reject("Missing 'data'")
            return
        }
        io.execute {
            val out = output
            if (out == null) {
                call.reject("Not connected")
                return@execute
            }
            try {
                out.write(Base64.decode(data, Base64.NO_WRAP))
                out.flush()
                call.resolve()
            } catch (e: Exception) {
                call.reject("Write failed: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun read(call: PluginCall) {
        val length = call.getInt("length")
        val timeoutMs = (call.getInt("timeoutMs") ?: DEFAULT_TIMEOUT_MS).toLong()
        io.execute {
            if (input == null) {
                call.reject("Not connected")
                return@execute
            }
            val bytes = consume(length, timeoutMs)
            val result = JSObject()
            result.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
            call.resolve(result)
        }
    }

    // --- internals -----------------------------------------------------------

    private fun startReader() {
        val stream = input ?: return
        val thread = Thread {
            val chunk = ByteArray(1024)
            try {
                while (!Thread.currentThread().isInterrupted) {
                    val n = stream.read(chunk)
                    if (n < 0) break
                    if (n > 0) {
                        synchronized(bufferLock) {
                            buffer += chunk.copyOf(n)
                        }
                    }
                }
            } catch (_: Exception) {
                // socket closed / read error -> reader stops
            }
        }
        thread.isDaemon = true
        readerThread = thread
        thread.start()
    }

    /** Read a fixed number of bytes, or until the line goes idle, up to timeout. */
    private fun consume(length: Int?, timeoutMs: Long): ByteArray {
        val deadline = System.currentTimeMillis() + timeoutMs

        if (length != null && length > 0) {
            while (true) {
                synchronized(bufferLock) {
                    if (buffer.size >= length) {
                        val out = buffer.copyOfRange(0, length)
                        buffer = buffer.copyOfRange(length, buffer.size)
                        return out
                    }
                }
                if (System.currentTimeMillis() >= deadline) {
                    synchronized(bufferLock) {
                        val out = buffer
                        buffer = ByteArray(0)
                        return out
                    }
                }
                Thread.sleep(5)
            }
        }

        var lastSize = -1
        var idleSince = System.currentTimeMillis()
        while (System.currentTimeMillis() < deadline) {
            val size = synchronized(bufferLock) { buffer.size }
            if (size != lastSize) {
                lastSize = size
                idleSince = System.currentTimeMillis()
            } else if (size > 0 && System.currentTimeMillis() - idleSince > 100) {
                break
            }
            Thread.sleep(10)
        }
        synchronized(bufferLock) {
            val out = buffer
            buffer = ByteArray(0)
            return out
        }
    }

    private fun closeConnection() {
        readerThread?.interrupt()
        readerThread = null
        try {
            input?.close()
        } catch (_: Exception) {
        }
        try {
            output?.close()
        } catch (_: Exception) {
        }
        try {
            socket?.close()
        } catch (_: Exception) {
        }
        input = null
        output = null
        socket = null
        synchronized(bufferLock) { buffer = ByteArray(0) }
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        closeConnection()
    }
}
