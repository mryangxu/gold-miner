import SwiftUI
import WebKit

@main
struct GoldMinerApp: App {
    var body: some Scene {
        WindowGroup {
            ZStack {
                Color(red: 0.07, green: 0.055, blue: 0.031)
                    .ignoresSafeArea()
                GameWebView()
            }
            .preferredColorScheme(.dark)
        }
    }
}

struct GameWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.suppressesIncrementalRendering = false
        config.allowsPictureInPictureMediaPlayback = false

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        webView.isMultipleTouchEnabled = true
        webView.scrollView.delaysContentTouches = false

        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }

        if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            let html = "<html><body style='background:#120e08;color:#fff;font-family:-apple-system;"
                + "display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>"
                + "<div style='text-align:center'>资源缺失：www/index.html</div></body></html>"
            webView.loadHTMLString(html, baseURL: nil)
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) { }
}
