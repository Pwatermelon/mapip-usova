FROM mcr.microsoft.com/dotnet/aspnet:6.0 AS base
WORKDIR /app
EXPOSE 80

FROM mcr.microsoft.com/dotnet/sdk:6.0 AS build
WORKDIR /src
COPY . .
RUN dotnet restore
RUN dotnet publish -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
COPY Ontology_Social_objects_new.rdf .
COPY Ontology_Social_objects_new.owl .
COPY ./clientapp ./clientapp
ENTRYPOINT ["dotnet", "MapApi.dll"]
