package br.com.guibomba.retroroyale;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
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
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
public final class MainActivity extends Activity {
 private WebView game; private FrameLayout root; private View errorView;
 private boolean mainLoadFailed,pageLoaded,networkOnline,wifi;
 private ConnectivityManager connectivity; private ConnectivityManager.NetworkCallback networkCallback;
 private final String gameHost=Uri.parse(BuildConfig.GAME_URL).getHost();
 @Override public void onCreate(Bundle state){
  super.onCreate(state);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);fullscreen();root=new FrameLayout(this);game=new WebView(this);game.setBackgroundColor(Color.rgb(16,61,114));
  WebSettings settings=game.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setMediaPlaybackRequiresUserGesture(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setSupportZoom(false);settings.setUserAgentString(settings.getUserAgentString()+" RetroRoyaleAndroid/1.5");
  CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(game,false);WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);game.setWebChromeClient(new WebChromeClient());
  game.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
    Uri uri=request.getUrl();boolean own="https".equals(uri.getScheme())&&gameHost.equalsIgnoreCase(uri.getHost())&&(uri.getPort()==-1||uri.getPort()==443);
    if(own&&request.isForMainFrame()&&"/api/account/authorize".equals(uri.getPath())){openBrowser(uri);return true;}if(own)return false;
    if(request.isForMainFrame()&&("https".equals(uri.getScheme())||"http".equals(uri.getScheme())))openBrowser(uri);return true;
   }
   @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap favicon){mainLoadFailed=false;}
   @Override public void onPageFinished(WebView view,String url){if(!mainLoadFailed){pageLoaded=true;if(errorView!=null){root.removeView(errorView);errorView=null;}}publishNetwork();}
   @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame()){mainLoadFailed=true;pageLoaded=false;showOffline();}}
   @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,android.webkit.WebResourceResponse response){if(request.isForMainFrame()&&response.getStatusCode()>=400){mainLoadFailed=true;pageLoaded=false;showOffline();}}
  });root.addView(game,new FrameLayout.LayoutParams(-1,-1));setContentView(root);watchNetwork();game.loadUrl(BuildConfig.GAME_URL);
 }
 private void openBrowser(Uri uri){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(ActivityNotFoundException ignored){new AlertDialog.Builder(this).setMessage("Instale ou habilite um navegador para entrar com Google.").setPositiveButton("OK",null).show();}}
 private void watchNetwork(){
  connectivity=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);if(connectivity==null)return;
  networkCallback=new ConnectivityManager.NetworkCallback(){
   @Override public void onCapabilitiesChanged(Network network,NetworkCapabilities caps){final boolean online=caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);final boolean isWifi=caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);runOnUiThread(()->updateNetwork(online,isWifi));}
   @Override public void onLost(Network network){runOnUiThread(()->updateNetwork(false,false));}
  };connectivity.registerDefaultNetworkCallback(networkCallback);refreshNetwork();
 }
 private void refreshNetwork(){if(connectivity==null)return;Network active=connectivity.getActiveNetwork();NetworkCapabilities caps=active==null?null:connectivity.getNetworkCapabilities(active);updateNetwork(caps!=null&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),caps!=null&&caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI));}
 private void updateNetwork(boolean online,boolean isWifi){boolean recovered=!networkOnline&&online;networkOnline=online;wifi=isWifi;publishNetwork();if(recovered&&!pageLoaded&&mainLoadFailed&&game!=null)game.loadUrl(BuildConfig.GAME_URL);}
 private void publishNetwork(){if(game!=null)game.evaluateJavascript("window.dispatchEvent(new CustomEvent('retro-network',{detail:{online:"+networkOnline+",wifi:"+wifi+"}}))",null);}
 private void fullscreen(){getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);}
 private void showOffline(){
  if(errorView!=null)return;LinearLayout panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);panel.setGravity(17);panel.setPadding(36,36,36,36);panel.setBackgroundColor(Color.rgb(16,61,114));
  ImageView logo=new ImageView(this);logo.setImageResource(R.drawable.ic_launcher);logo.setContentDescription("Retro Royale");logo.setScaleType(ImageView.ScaleType.FIT_CENTER);int size=(int)(120*getResources().getDisplayMetrics().density);panel.addView(logo,new LinearLayout.LayoutParams(size,size));
  TextView title=new TextView(this);title.setText("Retro Royale\nSem acesso ao jogo. Verifique o Wi-Fi ou os dados móveis.\nTentaremos novamente quando a conexão voltar.");title.setTextColor(Color.WHITE);title.setTextSize(19);title.setGravity(17);title.setPadding(0,24,0,24);
  Button retry=new Button(this);retry.setText("Tentar novamente");retry.setOnClickListener(v->{refreshNetwork();game.loadUrl(BuildConfig.GAME_URL);});panel.addView(title);panel.addView(retry);root.addView(panel,new FrameLayout.LayoutParams(-1,-1));errorView=panel;
 }
 @Override public void onWindowFocusChanged(boolean focused){super.onWindowFocusChanged(focused);if(focused)fullscreen();}
 @Override protected void onResume(){super.onResume();if(game!=null)game.onResume();refreshNetwork();fullscreen();}
 @Override protected void onPause(){if(game!=null)game.onPause();super.onPause();}
 @Override public void onBackPressed(){new AlertDialog.Builder(this).setTitle("Sair da arena?").setMessage("Sair encerra sua conexão com a partida.").setNegativeButton("Continuar",(d,w)->fullscreen()).setPositiveButton("Sair",(d,w)->{game.evaluateJavascript("window.NET && NET.leave && NET.leave()",null);finish();}).show();}
 @Override protected void onDestroy(){if(connectivity!=null&&networkCallback!=null)connectivity.unregisterNetworkCallback(networkCallback);if(game!=null){root.removeView(game);game.destroy();game=null;}super.onDestroy();}
}
