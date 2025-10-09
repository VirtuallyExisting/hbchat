// hbchat (3DS Client)
// Author: Virtualle/VirtuallyExisting
// Description: A chatting application for Wii and 3DS

#include <3ds.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <malloc.h>

#include <3ds/applets/swkbd.h>

#include <citro2d.h>

C2D_TextBuf sbuffer;
C2D_Text stext;

C2D_TextBuf chatbuffer;
C2D_Text chat;

char chatstring[6000] = "-chat-";
char usernameholder[64];

float chatscroll = 0;



int main(int argc, char **argv) {
    gfxInitDefault();
    C3D_Init(C3D_DEFAULT_CMDBUF_SIZE);
    C2D_Init(C2D_DEFAULT_MAX_OBJECTS);
    C2D_Prepare();
    C3D_RenderTarget* top = C2D_CreateScreenTarget(GFX_TOP, GFX_LEFT);
    C3D_RenderTarget* bottom = C2D_CreateScreenTarget(GFX_BOTTOM, GFX_LEFT);

    sbuffer = C2D_TextBufNew(4096);
    chatbuffer = C2D_TextBufNew(4096);


    C2D_TextParse(&chat, chatbuffer, chatstring);
    C2D_TextOptimize(&chat);


    u32 *soc_buffer = memalign(0x1000, 0x100000);
    if (!soc_buffer) {
        // placeholder
    }
    if (socInit(soc_buffer, 0x100000) != 0) {
        // placeholder
    }

    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        // placeholder
    }

    struct sockaddr_in server;
    memset(&server, 0, sizeof(server));
    server.sin_family = AF_INET;
    server.sin_port = htons(3071); // Every hbchat server should be on port 3071, if not, it will not work with any default instance, I might change this.
    server.sin_addr.s_addr = inet_addr("104.236.25.60"); // My server

    if (connect(sock, (struct sockaddr*)&server, sizeof(server)) != 0) {
        // placeholder
    }

    char username[32];

    struct timeval timeout;
    timeout.tv_sec = 0;
    timeout.tv_usec = 10000; // 10ms

    char buffer[512];
    while (aptMainLoop()) {
        gspWaitForVBlank();
        hidScanInput();

        if (hidKeysDown() & KEY_A) {
            char message[64];
            char input[64];
            SwkbdState swkbd;
            swkbdInit(&swkbd, SWKBD_TYPE_NORMAL, 1, 63);
            swkbdSetFeatures(&swkbd, SWKBD_PREDICTIVE_INPUT);
            swkbdSetValidation(&swkbd, SWKBD_NOTEMPTY, 0, 0);

            SwkbdButton button = swkbdInputText(&swkbd, username, sizeof(username)); 
        }

        if (hidKeysDown() & KEY_B) {
            char message[64];
            char msg[128];

            char input[64];
            SwkbdState swkbd;
            swkbdInit(&swkbd, SWKBD_TYPE_NORMAL, 1, 63);
            swkbdSetFeatures(&swkbd, SWKBD_PREDICTIVE_INPUT);
            swkbdSetValidation(&swkbd, SWKBD_NOTEMPTY, 0, 0);

            SwkbdButton button = swkbdInputText(&swkbd, message, sizeof(message));
            if (button == SWKBD_BUTTON_CONFIRM) {
                sprintf(msg, "<%s>: %s", username, message);
                send(sock, msg, strlen(msg), 0);
                printf("Message sent!\n");
            }
        }

        fd_set readfds;
        struct timeval timeout;

        FD_ZERO(&readfds);
        FD_SET(sock, &readfds);
        timeout.tv_sec = 0;
        timeout.tv_usec = 10000; // 10ms

        if (select(sock + 1, &readfds, NULL, NULL, &timeout) > 0) {
            ssize_t len = recv(sock, buffer, sizeof(buffer)-1, 0);
            if (len > 0) {
                buffer[len] = '\0';

                sprintf(chatstring, "%s\n%s", chatstring, buffer);

                C2D_TextParse(&chat, chatbuffer, chatstring);
                C2D_TextOptimize(&chat);
                chatscroll = chatscroll - 10;

                const char* parseResult = C2D_TextParse(&chat, chatbuffer, chatstring);
                if (parseResult != NULL && *parseResult != '\0') {
                    chatbuffer = C2D_TextBufResize(chatbuffer, 8192);
                    if (chatbuffer) {
                        C2D_TextBufClear(chatbuffer);
                        C2D_TextParse(&chat, chatbuffer, chatstring);
                    }
                }
                C2D_TextOptimize(&chat);
            }
        }

        if (hidKeysDown() & KEY_START) break;

        if (hidKeysHeld() & KEY_CPAD_DOWN) {
            chatscroll = chatscroll - 5;
        }

        if (hidKeysHeld() & KEY_CPAD_UP) {
            chatscroll = chatscroll + 5;
        }

        C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
        C2D_TargetClear(top, C2D_Color32(0x00, 0x0E, 0xE0, 0xFF));
        C2D_SceneBegin(top);

        C2D_TextBufClear(sbuffer);
        C2D_TextParse(&stext, sbuffer, "hbchat");
        C2D_TextOptimize(&stext);

        C2D_DrawText(&stext, 0, 155.0f, 0.0f, 0.5f, 1.0f, 1.0f);

        sprintf(usernameholder, "%s %s", "Username:", username);

        C2D_TextBufClear(sbuffer);
        C2D_TextParse(&stext, sbuffer, usernameholder);
        C2D_TextOptimize(&stext);

        C2D_DrawText(&stext, 0, 0.0f, 200.0f, 0.5f, 1.0f, 1.0f);


        C2D_TargetClear(bottom, C2D_Color32(0x00, 0x0E, 0xE0, 0xFF));
        C2D_SceneBegin(bottom);

        C2D_DrawText(&chat, C2D_WordWrap, 0.0f, chatscroll, 0.5f, 0.5f, 0.5f, 350.0f);



        C3D_FrameEnd(0);







    }
    closesocket(sock);
    socExit();
    gfxExit();
    return 0;
}