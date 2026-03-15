package eu.kanade.tachiyomi.network

import okhttp3.Dns
import java.net.Inet4Address
import java.net.InetAddress

/**
 * Some source hosts advertise IPv6 records that are not reachable from every network.
 * Keep every resolved address, but prefer IPv4 first to avoid long IPv6 connect timeouts
 * when an A record is also available.
 */
class Ipv4FirstDns(
    private val delegate: Dns = Dns.SYSTEM,
) : Dns {

    override fun lookup(hostname: String): List<InetAddress> {
        return delegate.lookup(hostname).sortedByDescending { it is Inet4Address }
    }
}
