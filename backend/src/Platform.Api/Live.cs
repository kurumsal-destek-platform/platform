using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.SignalR;

namespace Platform.Api;

// Gerçek zamanlı güncelleme: her kullanıcı kendi firmasının grubuna katılır.
// Bir şey değişince o firmadaki açık ekranlara "şu alan değişti" sinyali gider; ekranlar ilgili veriyi yeniden çeker.
// Veri SignalR'dan gönderilmez, sadece "yenile" sinyali: yetki kontrolleri normal API'de kalır.
[Authorize]
public class LiveHub : Hub
{
    public static string Group(Guid tenantId) => $"tenant:{tenantId}";

    public override async Task OnConnectedAsync()
    {
        if (Guid.TryParse(Context.User?.FindFirst("tenant_id")?.Value, out var tid))
            await Groups.AddToGroupAsync(Context.ConnectionId, Group(tid));
        await base.OnConnectedAsync();
    }

    public static Task BroadcastAsync(IHubContext<LiveHub> hub, Guid tenantId, string path, string? by = null) =>
        hub.Clients.Group(Group(tenantId)).SendAsync("changed", new { path, by, at = DateTime.UtcNow });
}

// Başarılı her POST/PUT/PATCH/DELETE isteğinden sonra firmaya "değişti" sinyali gönderir.
public class LiveBroadcastFilter : IAsyncActionFilter
{
    private readonly IHubContext<LiveHub> _hub;
    public LiveBroadcastFilter(IHubContext<LiveHub> hub) { _hub = hub; }

    public async Task OnActionExecutionAsync(ActionExecutingContext ctx, ActionExecutionDelegate next)
    {
        var done = await next();
        var http = ctx.HttpContext;
        if (HttpMethods.IsGet(http.Request.Method) || done.Exception is not null) return;
        // Sonuç henüz yazılmadı: durum kodunu sonuç nesnesinden oku (400/403/404 → yayın yok)
        var code = done.Result switch
        {
            IStatusCodeActionResult r when r.StatusCode is int c => c,
            _ => 200,
        };
        if (code >= 400) return;
        if (!Guid.TryParse(http.User.FindFirst("tenant_id")?.Value, out var tid)) return;
        try { await LiveHub.BroadcastAsync(_hub, tid, http.Request.Path.Value ?? "", http.User.FindFirst("sub")?.Value); }
        catch { /* canlı güncelleme yardımcı bir özellik; isteği asla bozmasın */ }
    }
}
