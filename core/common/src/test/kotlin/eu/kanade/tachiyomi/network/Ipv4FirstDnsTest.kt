package eu.kanade.tachiyomi.network

import io.kotest.matchers.collections.shouldContainExactly
import okhttp3.Dns
import org.junit.jupiter.api.Test
import java.net.InetAddress

class Ipv4FirstDnsTest {

    @Test
    fun `lookup prefers ipv4 addresses while keeping every result`() {
        val ipv6 = InetAddress.getByName("2607:7700:0:42::1")
        val ipv4a = InetAddress.getByName("104.21.32.1")
        val ipv4b = InetAddress.getByName("172.67.64.1")
        val dns = Ipv4FirstDns(
            Dns { listOf(ipv6, ipv4a, ipv4b) },
        )

        dns.lookup("animepahe.si") shouldContainExactly listOf(ipv4a, ipv4b, ipv6)
    }

    @Test
    fun `lookup leaves same-family ordering unchanged`() {
        val firstIpv6 = InetAddress.getByName("2607:7700:0:42::1")
        val secondIpv6 = InetAddress.getByName("2607:7700:0:42::2")
        val dns = Ipv4FirstDns(
            Dns { listOf(firstIpv6, secondIpv6) },
        )

        dns.lookup("animepahe.si") shouldContainExactly listOf(firstIpv6, secondIpv6)
    }
}
