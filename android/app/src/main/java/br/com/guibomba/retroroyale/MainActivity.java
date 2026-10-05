package br.com.guibomba.retroroyale;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private WebView game;
    private FrameLayout root;
    private View errorView;
    private final String gameHost = Uri.parse(BuildConfig.GAME_URL).getHost();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        fullscreen();
        root = new FrameLayout(this);
        game = new WebView(this);
        game.setBackgroundColor(Color.rgb(23,43,33));
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setUserAgentString(settings.getUserAgentString() + " RetroRoyaleAndroid/1.4");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(game, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        game.setWebChromeClient(new WebChromeClient());
        game.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && gameHost.equals(uri.getHost())) return false;
                if (request.isForMainFrame() && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (ActivityNotFoundException ignored) { }
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (errorView != null) { root.removeView(errorView); errorView = null; }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }
        });
        root.addView(game, new FrameLayout.LayoutParams(-1,-1));
        setContentView(root);
        game.loadUrl(BuildConfig.GAME_URL);
    }

    private void fullscreen() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }
    private void showOffline() {
        if (errorView != null) return;
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL); panel.setGravity(17); panel.setPadding(36,36,36,36);
        panel.setBackgroundColor(Color.rgb(23,43,33));
        TextView title = new TextView(this); title.setText("Retro Royale\nConecte à internet para entrar na arena."); title.setTextColor(Color.WHITE); title.setTextSize(20); title.setGravity(17);
        Button retry = new Button(this); retry.setText("Tentar novamente"); retry.setOnClickListener(v -> { root.removeView(panel); errorView = null; game.loadUrl(BuildConfig.GAME_URL); });
        panel.addView(title); panel.addView(retry); root.addView(panel, new FrameLayout.LayoutParams(-1,-1)); errorView = panel;
    }
    @Override public void onWindowFocusChanged(boolean focused) { super.onWindowFocusChanged(focused); if (focused) fullscreen(); }
    @Override protected void onResume() { super.onResume(); if (game != null) game.onResume(); fullscreen(); }
    @Override protected void onPause() { if (game != null) game.onPause(); super.onPause(); }
    @Override public void onBackPressed() {
        new AlertDialog.Builder(this).setTitle("Sair da arena?").setMessage("Sair encerra sua conexão com a partida.").setNegativeButton("Continuar", (d,w) -> fullscreen()).setPositiveButton("Sair", (d,w) -> { game.evaluateJavascript("window.NET && NET.leave && NET.leave()", null); finish(); }).show();
    }
    @Override protected void onDestroy() { if (game != null) { root.removeView(game); game.destroy(); } super.onDestroy(); }
}
