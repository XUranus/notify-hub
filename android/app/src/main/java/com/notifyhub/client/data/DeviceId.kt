package com.notifyhub.client.data

import android.annotation.SuppressLint
import android.content.Context
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings
import java.net.NetworkInterface
import java.security.MessageDigest
import java.util.UUID

/**
 * Generate a deterministic UUID from device hardware info.
 * Uses ANDROID_ID + MAC address(es) + hardware serial so the UUID
 * stays consistent across app reinstalls on the same device.
 */
object DeviceId {

    @SuppressLint("HardwareIds")
    fun generate(context: Context): String {
        val parts = mutableListOf<String>()

        // 1. ANDROID_ID — unique per device + user + signing key
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        if (!androidId.isNullOrBlank() && androidId != "9774d56d682e549c") {
            parts.add("android:$androidId")
        }

        // 2. MAC addresses from network interfaces (eth0, wlan0)
        try {
            val macs = getMacAddresses()
            if (macs.isNotEmpty()) {
                parts.add("mac:${macs.sorted().joinToString(",")}")
            }
        } catch (_: Exception) { }

        // 3. Hardware serial / Build fields
        try {
            val serial = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Build.getSerial()
            } else {
                @Suppress("DEPRECATION")
                Build.SERIAL
            }
            if (!serial.isNullOrBlank() && serial != "unknown") {
                parts.add("serial:$serial")
            }
        } catch (_: SecurityException) { }
        parts.add("model:${Build.MODEL}")
        parts.add("manufacturer:${Build.MANUFACTURER}")

        // 4. Fallback: if we only got one piece of info, add device fingerprint
        if (parts.size < 2) {
            parts.add("fingerprint:${Build.FINGERPRINT}")
        }

        val seed = parts.joinToString("|")

        // SHA-256 hash → take first 16 bytes → build UUID v3-like
        val md = MessageDigest.getInstance("SHA-256")
        val hash = md.digest(seed.toByteArray(Charsets.UTF_8))

        // Set version 5 (0101) and variant (10xx)
        hash[6] = ((hash[6].toInt() and 0x0F) or 0x50).toByte() // version 5
        hash[8] = ((hash[8].toInt() and 0x3F) or 0x80).toByte() // variant 1

        val uuid = UUID(
            bytesToLong(hash, 0),
            bytesToLong(hash, 8)
        )
        return uuid.toString()
    }

    private fun getMacAddresses(): List<String> {
        val macs = mutableListOf<String>()
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return macs
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                val mac = iface.hardwareAddress ?: continue
                if (mac.all { it.toInt() == 0 }) continue
                macs.add(mac.joinToString(":") { String.format("%02x", it) })
            }
        } catch (_: Exception) { }
        return macs
    }

    private fun bytesToLong(bytes: ByteArray, offset: Int): Long {
        var value = 0L
        for (i in 0 until 8) {
            value = (value shl 8) or (bytes[offset + i].toLong() and 0xFF)
        }
        return value
    }
}
