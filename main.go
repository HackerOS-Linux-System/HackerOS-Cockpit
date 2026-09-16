package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"hackercockpit/internal/config"
	"hackercockpit/internal/httpserver"
	"hackercockpit/internal/version"
)

const banner = "\033[32m[HackerCockpit]\033[0m"

func main() {
	cfg := config.Load()

	srv, genPassword, err := httpserver.New(cfg)
	if err != nil {
		log.Fatalf("%s startup failed: %v", banner, err)
	}

	fmt.Printf("%s %s v%s (%s) starting on %s:%d...\n", banner, version.Name, version.Version, version.Codename, cfg.Host, cfg.Port)
	if cfg.AuthEnabled {
		fmt.Printf("%s Authentication is ENABLED.\n", banner)
		if genPassword != "" {
			fmt.Printf("%s First run detected — generated admin credentials:\n", banner)
			fmt.Printf("%s   username: admin\n", banner)
			fmt.Printf("%s   password: %s\n", banner, genPassword)
			fmt.Printf("%s Save this now — it will not be shown again. Change it from the panel afterwards.\n", banner)
		}
	} else {
		fmt.Printf("%s Authentication is DISABLED (set HCKPT_AUTH=1 to enable). Anyone reaching this port has full control.\n", banner)
	}

	httpSrv := &http.Server{
		Addr:              fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("%s server error: %v", banner, err)
		}
	}()
	fmt.Printf("%s Running at http://%s:%d\n", banner, cfg.Host, cfg.Port)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	fmt.Printf("\n%s Shutting down…\n", banner)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(ctx); err != nil {
		log.Printf("%s graceful shutdown failed: %v", banner, err)
	}
	fmt.Printf("%s Stopped.\n", banner)
}
